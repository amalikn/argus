import { appendFileSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexAdapter } from '../src/adapters/openai-codex';
import { parseRolloutIncremental } from '../src/adapters/openai-codex/parser';

const adapter = new CodexAdapter();
const dir = mkdtempSync(join(tmpdir(), 'argus-codex-scale-'));

const SOURCE = {
  providerId: 'openai-codex',
  clientName: 'Codex',
  sourceKind: 'jsonl' as const,
  sourcePath: '',
};

function meta(): string {
  return JSON.stringify({
    timestamp: '2026-09-01T00:00:00.000Z',
    type: 'session_meta',
    payload: { id: 'scale', cwd: '/workspace', originator: 'codex_cli', cli_version: '0.0.0', model_provider: 'openai' },
  }) + '\n';
}

function exec(i: number): string {
  return JSON.stringify({
    timestamp: '2026-09-01T00:00:01.000Z',
    type: 'event_msg',
    payload: {
      type: 'exec_command_end',
      call_id: `c${i}`,
      command: `echo ${i}`,
      cwd: '/workspace',
      exit_code: 0,
      // Padding so the fixture reaches a realistic size; real rollouts carry large command output.
      aggregated_output: 'x'.repeat(600),
    },
  }) + '\n';
}

describe('Codex scale handling', () => {
  // The largest rollout in the local store is 45 MB. A parser that read one whole would be the single largest
  // allocation the extension makes, and re-reading it on every append would be unusable. This is the budget.
  it('parses a large rollout by streaming, within the time budget', async () => {
    const file = join(dir, 'large.jsonl');
    const records = 20_000; // roughly 15 MB at ~750 bytes per record
    writeFileSync(file, meta());
    const chunk: string[] = [];
    for (let i = 0; i < records; i++) {
      chunk.push(exec(i));
      if (chunk.length === 1000) {
        appendFileSync(file, chunk.join(''));
        chunk.length = 0;
      }
    }
    appendFileSync(file, chunk.join(''));

    const bytes = statSync(file).size;
    expect(bytes).toBeGreaterThan(10_000_000);

    const started = Date.now();
    const session = await adapter.parse({ id: 'scale', providerId: 'openai-codex', source: { ...SOURCE, sourcePath: file } });
    const elapsed = Date.now() - started;

    expect(session.events.filter((e) => e.kind === 'shell.command')).toHaveLength(records);
    // Generous, because CI machines vary. The point is to catch an accidental O(n^2) or a whole-file read,
    // both of which blow past this by an order of magnitude rather than a few percent.
    expect(elapsed).toBeLessThan(30_000);
  }, 120_000);

  it('reads only the appended bytes on an incremental pass', async () => {
    const file = join(dir, 'incremental.jsonl');
    writeFileSync(file, meta() + exec(1) + exec(2));

    const first = await parseRolloutIncremental(file, 'inc', { ...SOURCE, sourcePath: file });
    expect(first.session.events.filter((e) => e.kind === 'shell.command')).toHaveLength(2);
    expect(first.endOffset).toBe(statSync(file).size);

    appendFileSync(file, exec(3));
    const second = await parseRolloutIncremental(file, 'inc', { ...SOURCE, sourcePath: file }, {
      fromOffset: first.endOffset,
      fromSequence: first.endSequence,
    });

    // Only the appended record, not the whole file re-read.
    expect(second.session.events.filter((e) => e.kind === 'shell.command')).toHaveLength(1);
    expect(second.endOffset).toBe(statSync(file).size);
    // Sequence continues, so event ids stay unique and ordered across reads.
    expect(second.endSequence).toBeGreaterThan(first.endSequence);
  });

  // The correctness case that makes incremental reading safe: a rollout read mid-write ends on a partial
  // record. Advancing the offset past it would drop that record permanently once the rest lands.
  it('does not advance the offset past a partially written final line', async () => {
    const file = join(dir, 'partial.jsonl');
    const whole = exec(9);
    writeFileSync(file, meta() + whole.slice(0, whole.length / 2));

    const first = await parseRolloutIncremental(file, 'partial', { ...SOURCE, sourcePath: file });
    expect(first.endOffset).toBeLessThan(statSync(file).size);
    expect(first.session.diagnostics.some((d) => d.code === 'malformed-lines')).toBe(true);

    // The rest of the record lands. Resuming from the recorded offset must yield the complete record.
    writeFileSync(file, meta() + whole);
    const second = await parseRolloutIncremental(file, 'partial', { ...SOURCE, sourcePath: file }, {
      fromOffset: first.endOffset,
      fromSequence: first.endSequence,
    });
    expect(second.session.events.filter((e) => e.kind === 'shell.command')).toHaveLength(1);
  });

  it('emits deltas from a live rollout and stops after dispose', async () => {
    const file = join(dir, 'live.jsonl');
    writeFileSync(file, meta() + exec(1));

    const deltas: number[] = [];
    const handle = await adapter.watch(
      { id: 'live', providerId: 'openai-codex', source: { ...SOURCE, sourcePath: file } },
      (d) => deltas.push(d.appendedEvents.length),
      { debounceMs: 20 }
    );
    expect(deltas.length).toBeGreaterThanOrEqual(1);

    // fs.watch registration is not effective instantly on macOS; a real consumer never writes this fast.
    await new Promise((r) => setTimeout(r, 100));
    appendFileSync(file, exec(2));
    await new Promise((r) => setTimeout(r, 300));
    const afterGrowth = deltas.length;
    expect(afterGrowth).toBeGreaterThan(1);
    // The delta carries only what was appended, never the whole session again.
    expect(deltas.at(-1)).toBeLessThanOrEqual(2);

    handle.dispose();
    appendFileSync(file, exec(3));
    await new Promise((r) => setTimeout(r, 300));
    expect(deltas.length).toBe(afterGrowth);
  });
});
