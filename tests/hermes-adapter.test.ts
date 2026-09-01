import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { HermesAdapter } from '../src/adapters/hermes';
import { AgentEvent } from '../src/core/models/agentEvent';

const FIXTURES = join(__dirname, 'fixtures', 'hermes');
const adapter = new HermesAdapter();

function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'argus-hermes-'));
  const sessions = join(home, 'sessions');
  mkdirSync(sessions, { recursive: true });
  for (const f of readdirSync(FIXTURES)) {
    // Snapshots must carry the session_ prefix for discovery to classify them.
    const target = f.endsWith('.json') && !f.startsWith('session_') ? `session_${f}` : f;
    copyFileSync(join(FIXTURES, f), join(sessions, target));
  }
  return home;
}

const home = makeHome();
afterAll(() => rmSync(home, { recursive: true, force: true }));

function snapshot(name: string) {
  return {
    id: name,
    providerId: 'hermes',
    source: { providerId: 'hermes', clientName: 'Hermes', sourceKind: 'custom' as const, sourcePath: join(FIXTURES, name) },
  };
}

function mirror(name: string) {
  return {
    id: name.replace(/\.jsonl$/, ''),
    providerId: 'hermes',
    source: { providerId: 'hermes', clientName: 'Hermes', sourceKind: 'jsonl' as const, sourcePath: join(FIXTURES, name) },
  };
}

describe('HermesAdapter detection and discovery', () => {
  it('honours HERMES_HOME', async () => {
    const result = await adapter.detect({ env: { HERMES_HOME: home } });
    expect(result.available).toBe(true);
    expect(result.roots).toEqual([home]);
  });

  it('reports unavailable with a reason when Hermes is not installed', async () => {
    const result = await adapter.detect({ env: { HERMES_HOME: '/nonexistent' }, homeDir: '/nonexistent' });
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/no Hermes sessions directory/);
  });

  it('discovers both snapshot and mirror forms', async () => {
    const found = await adapter.discover({ roots: [home] });
    expect(found.length).toBeGreaterThanOrEqual(9);
    expect(found.some((f) => f.source.sourceKind === 'custom')).toBe(true);
    expect(found.some((f) => f.source.sourceKind === 'jsonl')).toBe(true);
  });

  // In the audited store 76 of 243 filenames disagreed with the embedded session_id. Keying on the filename
  // would have mis-identified nearly a third of the store, so discovery reads the id out of the file.
  it('takes the session id from the record, not the filename', async () => {
    const found = await adapter.discover({ roots: [home] });
    const ids = found.map((f) => f.id);
    expect(ids).toContain('20260901_111111_bbbbbbbb');
    expect(ids.some((i) => i.includes('MISMATCH'))).toBe(false);
  });

  it('does not list a session twice when both forms exist for it', async () => {
    const found = await adapter.discover({ roots: [home] });
    expect(new Set(found.map((f) => f.id)).size).toBe(found.length);
  });
});

describe('HermesAdapter snapshot parsing', () => {
  it('reads lifecycle timestamps as facts rather than inferring them', async () => {
    const s = await adapter.parse(snapshot('01-snapshot-basic.json'));
    expect(s.id).toBe('20260901_000000_aaaaaaaa');
    expect(s.startedAt).toBe('2026-09-01T00:00:00.000000');
    expect(s.updatedAt).toBe('2026-09-01T00:10:00.000000');
    expect(s.model).toBe('deepseek-v4-flash');
  });

  it('emits user, assistant, reasoning, shell and result events', async () => {
    const s = await adapter.parse(snapshot('01-snapshot-basic.json'));
    const kinds = s.events.map((e: AgentEvent) => e.kind);
    expect(kinds).toContain('message.user');
    expect(kinds).toContain('message.assistant');
    expect(kinds).toContain('reasoning');
    expect(kinds).toContain('shell.command');
    expect(kinds).toContain('tool.result');
  });

  // Hermes states that a function named `terminal` was called. That it is a shell execution is OUR inference
  // from the name, so the command event is derived while the result that carries the exit code is exact.
  it('marks a shell command derived and its result exact', async () => {
    const s = await adapter.parse(snapshot('01-snapshot-basic.json'));
    const cmd = s.events.find((e) => e.kind === 'shell.command')!;
    const res = s.events.find((e) => e.kind === 'tool.result')!;
    expect(cmd.confidence).toBe('derived');
    expect(res.confidence).toBe('exact');
  });

  it('carries the real exit code through to the result', async () => {
    const s = await adapter.parse(snapshot('04-command-failure.json'));
    const res = s.events.find((e: any) => e.kind === 'tool.result' && e.toolName === 'terminal') as any;
    expect(res.isError).toBe(true);
    expect(res.extensions?.exitCode).toBe(1);
  });

  it('maps file and browser tools onto file and network events', async () => {
    const s = await adapter.parse(snapshot('03-file-and-browser.json'));
    const kinds = s.events.map((e) => e.kind);
    expect(kinds).toContain('file.read');
    expect(kinds).toContain('file.write');
    expect(kinds).toContain('file.edit');
    expect(kinds).toContain('network.tool');
  });

  // The writer spells the key `name` on 8,625 records and `tool_name` on 6. Reading only one loses the tool
  // identity on the others.
  it('reads the rare tool_name spelling as well as name', async () => {
    const s = await adapter.parse(snapshot('03-file-and-browser.json'));
    const results = s.events.filter((e: any) => e.kind === 'tool.result') as any[];
    expect(results.every((r) => typeof r.toolName === 'string' && r.toolName.length > 0)).toBe(true);
  });

  // A synthetic recovery record is something Hermes fabricated after an empty model response. Rendering it as
  // an assistant message would put an invented turn into a forensic timeline.
  it('never normalizes a synthetic recovery record as a plain message', async () => {
    const s = await adapter.parse(snapshot('05-synthetic-recovery.json'));
    expect(s.events.some((e) => e.kind === 'provider.unknown')).toBe(true);
    expect(s.events.some((e) => e.kind === 'message.assistant')).toBe(false);
  });

  it('flags a message_count that disagrees with the messages present', async () => {
    const s = await adapter.parse(snapshot('07-count-mismatch.json'));
    expect(s.diagnostics.some((d) => d.code === 'message-count-mismatch')).toBe(true);
  });

  it('treats a delegation as heuristic, the weakest marker available', async () => {
    const s = await adapter.parse(snapshot('11-delegation.json'));
    const sub = s.events.find((e) => e.kind === 'subagent.start')!;
    expect(sub.confidence).toBe('heuristic');
    expect(s.capabilities.subagents).toBe(true);
  });
});

describe('HermesAdapter capability reporting', () => {
  // The single most consequential audit finding: no Hermes session in either format carries token counts.
  // Cost is false regardless of model - not because the model is unpriceable, but because there is nothing to
  // multiply. A cost view built on an assumed token count would be an invention.
  it('reports no token usage, no context metrics and no cost, for every session', async () => {
    for (const f of ['01-snapshot-basic.json', '03-file-and-browser.json', '06-local-model.json']) {
      const s = await adapter.parse(snapshot(f));
      expect(s.capabilities.tokenUsage, f).toBe(false);
      expect(s.capabilities.contextMetrics, f).toBe(false);
      expect(s.capabilities.cost, f).toBe(false);
      expect(s.metrics?.estimatedCostUsd, f).toBeUndefined();
      expect(s.metrics?.totalTokens, f).toBeUndefined();
    }
  });

  it('reports cost false even for a model that IS in the pricing table', async () => {
    // deepseek-v4-flash is present in the vendored table. The absence of counts is what decides this, not the
    // absence of a price.
    const s = await adapter.parse(snapshot('01-snapshot-basic.json'));
    expect(s.model).toBe('deepseek-v4-flash');
    expect(s.capabilities.cost).toBe(false);
  });

  it('reports capabilities from what the session contained', async () => {
    const withFiles = await adapter.parse(snapshot('03-file-and-browser.json'));
    const withoutFiles = await adapter.parse(snapshot('06-local-model.json'));
    expect(withFiles.capabilities.fileReads).toBe(true);
    expect(withoutFiles.capabilities.fileReads).toBe(false);
    expect(withoutFiles.capabilities.shellCommands).toBe(false);
  });
});

describe('HermesAdapter mirror parsing', () => {
  it('reads a mirror with a session_meta header', async () => {
    const s = await adapter.parse(mirror('08-mirror-with-header.jsonl'));
    expect(s.model).toBe('deepseek-v4-flash');
    expect(s.events.some((e) => e.kind === 'message.user')).toBe(true);
  });

  // 7 of 60 audited mirrors begin with a content row. An adapter that assumes a header mis-parses 12 percent.
  it('tolerates a mirror with no header and says so', async () => {
    const s = await adapter.parse(mirror('09-mirror-no-header.jsonl'));
    expect(s.events.length).toBeGreaterThan(0);
    expect(s.diagnostics.some((d) => d.code === 'no-session-meta')).toBe(true);
  });

  // Five real records in the audited store carry unescaped newlines inside a browser result, so one logical
  // record spans several physical lines. A line-oriented parser drops them silently.
  it('rejoins a record split across physical lines by an unescaped newline', async () => {
    const s = await adapter.parse(mirror('10-mirror-unescaped-newline.jsonl'));
    expect(s.diagnostics.some((d) => d.code === 'rejoined-continuation-lines')).toBe(true);
    expect(s.events.some((e) => e.kind === 'tool.result')).toBe(true);
    // The record after the split one must still be read.
    expect(s.events.some((e: any) => e.kind === 'message.user' && e.text === 'after')).toBe(true);
  });

  it('survives a truncated final record', async () => {
    const p = join(home, 'sessions', 'truncated.jsonl');
    writeFileSync(p, '{"role":"user","content":"ok","timestamp":"2026-09-01T00:00:00"}\n{"role":"assist');
    const s = await adapter.parse({
      id: 'truncated', providerId: 'hermes',
      source: { providerId: 'hermes', clientName: 'Hermes', sourceKind: 'jsonl', sourcePath: p },
    });
    expect(s.events.length).toBeGreaterThanOrEqual(1);
    expect(s.diagnostics.some((d) => d.code === 'malformed-lines')).toBe(true);
  });
});

describe('Hermes usage capability is derived, not asserted', () => {
  // The audit found no usage field anywhere in the store, which is why every session reports false. But that is a
  // DATED NEGATIVE FINDING about one version, not a permanent property of the provider. The adapter therefore LOOKS
  // on every record. This test proves the detection path works, so a future Hermes that starts reporting counts
  // flips the flag on its own rather than the adapter continuing to report false from a comment.
  it('flips tokenUsage on when a record carries usage', async () => {
    const p = join(home, 'sessions', 'session_with_usage.json');
    writeFileSync(p, JSON.stringify({
      session_id: 'with-usage', model: 'deepseek-v4-flash', platform: 'cli',
      session_start: '2026-09-02T00:00:00', last_updated: '2026-09-02T00:01:00',
      system_prompt: 'x', tools: [], message_count: 2,
      messages: [
        { role: 'user', content: 'hi', timestamp: '2026-09-02T00:00:00' },
        {
          role: 'assistant', content: 'ok', timestamp: '2026-09-02T00:00:30', finish_reason: 'stop',
          usage: { input_tokens: 100, output_tokens: 20, cached_input_tokens: 5 },
          model_context_window: 128000,
        },
      ],
    }));

    const s = await adapter.parse({
      id: 'with-usage', providerId: 'hermes',
      source: { providerId: 'hermes', clientName: 'Hermes', sourceKind: 'custom', sourcePath: p },
    });

    expect(s.capabilities.tokenUsage).toBe(true);
    expect(s.capabilities.contextMetrics).toBe(true);
    // Cost needs BOTH counts and a priceable model. deepseek-v4-flash is in the vendored table, so with counts
    // present it becomes computable — which is exactly the state the audit found absent.
    expect(s.capabilities.cost).toBe(true);
    const usage = s.events.find((e: any) => e.kind === 'usage.tokens') as any;
    expect(usage.inputTokens).toBe(100);
    expect(s.metrics?.contextWindowTokens).toBe(128000);
  });

  it('still reports false on the real fixtures, which carry no usage', async () => {
    const s = await adapter.parse(snapshot('01-snapshot-basic.json'));
    expect(s.capabilities.tokenUsage).toBe(false);
    expect(s.capabilities.cost).toBe(false);
  });
});
