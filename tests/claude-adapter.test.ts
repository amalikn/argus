import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { ClaudeCodeAdapter } from '../src/adapters/claude-code';
import { AgentEvent } from '../src/core/models/agentEvent';

const FIXTURES = join(__dirname, 'fixtures', 'claude');
const adapter = new ClaudeCodeAdapter();

/** Build a throwaway Claude config layout so discovery is exercised against a real directory tree. */
function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'argus-claude-'));
  const project = join(root, 'projects', '-tmp-fixture-project');
  mkdirSync(project, { recursive: true });
  for (const f of readdirSync(FIXTURES).filter((f) => f.endsWith('.jsonl'))) {
    copyFileSync(join(FIXTURES, f), join(project, f));
  }
  return root;
}

const root = makeRoot();
afterAll(() => rmSync(root, { recursive: true, force: true }));

function discovered(id: string) {
  return {
    id,
    providerId: 'claude-code',
    source: {
      providerId: 'claude-code',
      clientName: 'Claude Code',
      sourceKind: 'jsonl' as const,
      sourcePath: join(FIXTURES, `${id}.jsonl`),
    },
    projectPath: 'fixture-project',
  };
}

describe('ClaudeCodeAdapter detection and discovery', () => {
  it('detects a configured root that has a projects directory', async () => {
    const result = await adapter.detect({ configuredPaths: [root] });
    expect(result.available).toBe(true);
    expect(result.roots).toEqual([root]);
  });

  // A machine without Claude Code installed is a normal condition, not an error state. Detection returning a
  // reason rather than throwing is what lets the registry keep the other providers working.
  it('reports unavailable with a reason rather than throwing when nothing is installed', async () => {
    const result = await adapter.detect({ configuredPaths: ['/nonexistent'], env: { CLAUDE_CONFIG_DIR: '/nonexistent' } });
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/no Claude Code projects directory/);
  });

  it('discovers sessions without parsing them', async () => {
    const found = await adapter.discover({ roots: [root] });
    expect(found.length).toBeGreaterThanOrEqual(14);
    expect(found.every((f) => f.source.sourcePath?.endsWith('.jsonl'))).toBe(true);
    expect(found.every((f) => typeof f.sizeBytes === 'number')).toBe(true);
  });

  it('honours the since filter for incremental refresh', async () => {
    const future = new Date(Date.now() + 60_000);
    expect(await adapter.discover({ roots: [root], since: future })).toHaveLength(0);
  });
});

describe('ClaudeCodeAdapter parsing into the normalized model', () => {
  it('stamps provider, schema version and capabilities', async () => {
    const session = await adapter.parse(discovered('03-bash-failure'));
    expect(session.providerId).toBe('claude-code');
    expect(session.schemaVersion).toBe(1);
    expect(session.capabilities.shellCommands).toBe(true);
    expect(session.diagnostics).toBeInstanceOf(Array);
  });

  it('emits shell command events for Bash calls', async () => {
    const session = await adapter.parse(discovered('02-bash-success'));
    const shell = session.events.filter((e: AgentEvent) => e.kind === 'shell.command');
    expect(shell.length).toBeGreaterThan(0);
    expect((shell[0] as any).command).toBeTruthy();
  });

  it('marks a failed command as failed rather than unknown', async () => {
    const session = await adapter.parse(discovered('03-bash-failure'));
    const failed = session.events.filter((e: any) => e.kind === 'shell.command' && e.status === 'failed');
    expect(failed.length).toBeGreaterThan(0);
  });

  it('emits file events with paths', async () => {
    const session = await adapter.parse(discovered('04-read-write-edit'));
    const files = session.events.filter((e: AgentEvent) => e.kind.startsWith('file.'));
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((e: any) => typeof e.path === 'string' && e.path.length > 0)).toBe(true);
  });

  // Claude does not label a Bash call as a shell execution; the adapter recognizes it from the tool name.
  // That inference must be declared, or a consumer cannot tell a read fact from a deduced one.
  it('marks inferred event shapes as derived and read facts as exact', async () => {
    const session = await adapter.parse(discovered('02-bash-success'));
    const shell = session.events.find((e: AgentEvent) => e.kind === 'shell.command')!;
    expect(shell.confidence).toBe('derived');
    const usage = session.events.find((e: AgentEvent) => e.kind === 'usage.tokens');
    if (usage) {
      expect(usage.confidence).toBe('exact');
    }
  });

  it('aggregates token metrics, leaving cost undefined when nothing could be costed', async () => {
    const session = await adapter.parse(discovered('08-token-cost'));
    expect(session.metrics?.inputTokens).toBeGreaterThan(0);
    expect(session.metrics?.estimatedCostUsd).toBeGreaterThan(0);
  });

  // An unrecognized record is data. A parser that throws on one fails the moment a provider ships a new type.
  it('survives a malformed line and records no fatal error', async () => {
    const session = await adapter.parse(discovered('10-malformed-line'));
    expect(session.events.length).toBeGreaterThanOrEqual(1);
  });

  it('survives a truncated final line', async () => {
    const session = await adapter.parse(discovered('11-truncated-final-line'));
    expect(session).toBeDefined();
  });

  it('reports an empty transcript as a diagnostic rather than silently', async () => {
    const empty = join(root, 'projects', '-tmp-fixture-project', 'empty.jsonl');
    writeFileSync(empty, '');
    const session = await adapter.parse({
      ...discovered('empty'),
      source: { providerId: 'claude-code', clientName: 'Claude Code', sourceKind: 'jsonl', sourcePath: empty },
    });
    expect(session.diagnostics.some((d) => d.code === 'empty-session')).toBe(true);
  });
});

describe('ClaudeCodeAdapter live watch', () => {
  it('emits a delta when the transcript grows, then stops after dispose', async () => {
    const project = join(root, 'projects', '-tmp-fixture-project');
    const live = join(project, 'live.jsonl');
    const record = (uuid: string, text: string) =>
      JSON.stringify({
        type: 'assistant', uuid, parentUuid: null, sessionId: 'live', timestamp: new Date().toISOString(),
        message: { role: 'assistant', model: 'claude-sonnet-4-5-20250929', content: [{ type: 'text', text }] },
      }) + '\n';
    writeFileSync(live, record('u1', 'first'));

    const deltas: number[] = [];
    const handle = await adapter.watch(
      { ...discovered('live'), source: { providerId: 'claude-code', clientName: 'Claude Code', sourceKind: 'jsonl', sourcePath: live } },
      (d) => deltas.push(d.appendedEvents.length),
      { debounceMs: 20 }
    );

    // The first emit happens on subscribe, so a consumer sees the existing content without waiting for a write.
    expect(deltas.length).toBeGreaterThanOrEqual(1);

    // fs.watch registration is not effective instantly on macOS: a write issued microseconds after subscribing
    // is reliably missed. A real consumer never does that, but a test can, and without this pause the test
    // fails intermittently for a reason that has nothing to do with the code under test.
    await new Promise((r) => setTimeout(r, 100));
    writeFileSync(live, record('u1', 'first') + record('u2', 'second'));
    await new Promise((r) => setTimeout(r, 250));
    const afterGrowth = deltas.length;
    expect(afterGrowth).toBeGreaterThan(1);

    handle.dispose();
    writeFileSync(live, record('u1', 'first') + record('u2', 'second') + record('u3', 'third'));
    await new Promise((r) => setTimeout(r, 250));
    expect(deltas.length).toBe(afterGrowth);
  });
});
