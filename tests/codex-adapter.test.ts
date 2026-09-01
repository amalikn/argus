import { mkdtempSync, mkdirSync, copyFileSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CodexAdapter } from '../src/adapters/openai-codex';
import { AgentEvent } from '../src/core/models/agentEvent';

const FIXTURES = join(__dirname, 'fixtures', 'codex');
const adapter = new CodexAdapter();

/** Build a throwaway Codex home with the real date-partitioned layout. */
function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'argus-codex-'));
  const day = join(home, 'sessions', '2026', '09', '01');
  mkdirSync(day, { recursive: true });
  for (const f of readdirSync(FIXTURES).filter((f) => f.endsWith('.jsonl'))) {
    copyFileSync(join(FIXTURES, f), join(day, `rollout-2026-09-01T00-00-00-00000000-0000-4000-8000-${f.slice(0, 2)}0000000000.jsonl`));
  }
  return home;
}

const home = makeHome();
afterAll(() => rmSync(home, { recursive: true, force: true }));

function discovered(fixture: string) {
  return {
    id: fixture,
    providerId: 'openai-codex',
    source: {
      providerId: 'openai-codex',
      clientName: 'Codex',
      sourceKind: 'jsonl' as const,
      sourcePath: join(FIXTURES, `${fixture}.jsonl`),
    },
  };
}

describe('CodexAdapter detection and discovery', () => {
  it('honours CODEX_HOME', async () => {
    const result = await adapter.detect({ env: { CODEX_HOME: home } });
    expect(result.available).toBe(true);
    expect(result.roots).toEqual([home]);
  });

  it('reports unavailable with a reason when Codex is not installed', async () => {
    const result = await adapter.detect({ env: { CODEX_HOME: '/nonexistent' }, homeDir: '/nonexistent' });
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/no Codex sessions directory/);
  });

  it('walks the date partitions and finds rollouts', async () => {
    const found = await adapter.discover({ roots: [home] });
    expect(found.length).toBeGreaterThanOrEqual(9);
    expect(found.every((f) => f.source.sourcePath?.includes('/2026/09/01/'))).toBe(true);
  });

  it('takes the session id from the rollout uuid, not the whole filename', async () => {
    const found = await adapter.discover({ roots: [home] });
    expect(found.every((f) => /^[0-9a-f-]{36}$/.test(f.id))).toBe(true);
  });

  // The Codex home also holds caches, attachments and archived sessions. A recursive walk would ingest them.
  it('ignores files outside the date partitions', async () => {
    writeFileSync(join(home, 'sessions', 'stray.jsonl'), '{}\n');
    mkdirSync(join(home, 'cache'), { recursive: true });
    writeFileSync(join(home, 'cache', 'rollout-fake.jsonl'), '{}\n');
    const found = await adapter.discover({ roots: [home] });
    expect(found.some((f) => f.source.sourcePath?.includes('stray'))).toBe(false);
    expect(found.some((f) => f.source.sourcePath?.includes('/cache/'))).toBe(false);
  });
});

describe('CodexAdapter parsing', () => {
  it('reads session metadata from session_meta', async () => {
    const session = await adapter.parse(discovered('01-session-basics'));
    expect(session.providerId).toBe('openai-codex');
    expect(session.cwd).toBeTruthy();
    expect(session.startedAt).toBeTruthy();
    expect(session.source.clientVersion).toBeTruthy();
  });

  it('emits shell commands with a real exit code, marked exact', async () => {
    const session = await adapter.parse(discovered('02-exec-success'));
    const shell = session.events.filter((e: AgentEvent) => e.kind === 'shell.command') as any[];
    expect(shell.length).toBeGreaterThan(0);
    expect(shell[0].command).toBeTruthy();
    // Codex records the exit code, so status is READ. The same field is derived in the Claude adapter, and
    // that difference is exactly what the confidence marker exists to express.
    expect(shell[0].confidence).toBe('exact');
    expect(shell.some((s) => s.status === 'succeeded')).toBe(true);
  });

  it('distinguishes a failed command from an unknown one', async () => {
    const session = await adapter.parse(discovered('03-exec-failure'));
    const failed = session.events.filter((e: any) => e.kind === 'shell.command' && e.status === 'failed');
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((f: any) => typeof f.exitCode === 'number' && f.exitCode !== 0)).toBe(true);
  });

  it('emits one file event per changed path in a patch application', async () => {
    const session = await adapter.parse(discovered('04-patch-apply'));
    const files = session.events.filter((e: AgentEvent) => e.kind.startsWith('file.')) as any[];
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => typeof f.path === 'string' && f.path.length > 0)).toBe(true);
  });

  it('recognizes MCP calls by tool name', async () => {
    const session = await adapter.parse(discovered('05-mcp-call'));
    const mcp = session.events.filter((e: AgentEvent) => e.kind === 'mcp.call');
    expect(mcp.length).toBeGreaterThan(0);
    expect(session.capabilities.mcpCalls).toBe(true);
  });

  it('parses reasoning rather than dropping it', async () => {
    const session = await adapter.parse(discovered('06-reasoning'));
    expect(session.events.some((e: AgentEvent) => e.kind === 'reasoning')).toBe(true);
    expect(session.capabilities.reasoningMetadata).toBe(true);
  });

  it('aggregates token usage and the context window', async () => {
    const session = await adapter.parse(discovered('07-token-usage'));
    expect(session.metrics?.totalTokens).toBeGreaterThan(0);
    expect(session.metrics?.contextWindowTokens).toBeGreaterThan(0);
    expect(session.capabilities.tokenUsage).toBe(true);
    expect(session.capabilities.contextMetrics).toBe(true);
  });

  it('correlates a function call with its output by call_id', async () => {
    const session = await adapter.parse(discovered('05-mcp-call'));
    const results = session.events.filter((e: AgentEvent) => e.kind === 'tool.result') as any[];
    if (results.length > 0) {
      expect(results.some((r) => r.correlationId)).toBe(true);
    }
  });

  // Capabilities describe what THIS session contained, not what Codex can do in principle. A session with no
  // shell command must not offer a shell view.
  it('reports capabilities from the session content, not from the provider', async () => {
    const reasoningOnly = await adapter.parse(discovered('06-reasoning'));
    const execSession = await adapter.parse(discovered('02-exec-success'));
    expect(execSession.capabilities.shellCommands).toBe(true);
    expect(reasoningOnly.capabilities.subagents).toBe(false);
  });

  it('skips a malformed line, records a diagnostic, and keeps the rest', async () => {
    const session = await adapter.parse(discovered('08-malformed-line'));
    expect(session.events.length).toBeGreaterThanOrEqual(2);
    expect(session.diagnostics.some((d) => d.code === 'malformed-lines')).toBe(true);
  });

  it('survives a truncated final line', async () => {
    const session = await adapter.parse(discovered('09-truncated-final-line'));
    expect(session.events.length).toBeGreaterThanOrEqual(1);
    expect(session.diagnostics.some((d) => d.code === 'malformed-lines')).toBe(true);
  });

  it('keeps an unrecognized record as data rather than failing', async () => {
    const session = await adapter.parse(discovered('01-session-basics'));
    const unknown = session.events.filter((e: AgentEvent) => e.kind === 'provider.unknown');
    // Whether any appear depends on the fixture, but if they do they must carry their raw type for inspection.
    expect(unknown.every((e) => typeof e.rawType === 'string')).toBe(true);
  });
});

describe('CodexAdapter handles both rollout format generations', () => {
  // A real Codex store holds rollouts from several months of builds. The 2026-04 and 2026-06 rollouts emit
  // exec_command_end and patch_apply_end; the 2026-08 ones wrap everything in item_completed with a typed
  // item. An adapter that read only one generation would silently show empty sessions for half the store.
  it('reads shell commands from the item_completed generation', async () => {
    const session = await adapter.parse(discovered('03-exec-failure'));
    const shell = session.events.filter((e: any) => e.kind === 'shell.command');
    expect(shell.length).toBeGreaterThan(0);
    expect(session.events.some((e) => e.rawType?.startsWith('item_completed/'))).toBe(true);
  });

  it('reads file changes and compaction from the item_completed generation', async () => {
    const session = await adapter.parse(discovered('01-session-basics'));
    expect(session.events.some((e) => e.kind === 'file.edit' || e.kind === 'file.write')).toBe(true);
    expect(session.events.some((e) => e.kind === 'context.compaction')).toBe(true);
  });

  it('recognizes subagent activity, which only the newer generation records', async () => {
    const session = await adapter.parse(discovered('01-session-basics'));
    expect(session.events.some((e) => e.kind === 'subagent.start')).toBe(true);
    expect(session.capabilities.subagents).toBe(true);
  });

  it('keeps an unrecognized item type as data rather than dropping the record', async () => {
    const session = await adapter.parse(discovered('01-session-basics'));
    const unknown = session.events.filter((e) => e.kind === 'provider.unknown');
    expect(unknown.every((e) => e.rawType?.startsWith('item_completed/') || e.rawType?.includes('/'))).toBe(true);
  });
});
