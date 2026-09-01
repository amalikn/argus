import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ParserService } from '../src/services/parserService';
import { AnalyzerService } from '../src/services/analyzerService';

const DIR = join(__dirname, 'fixtures', 'claude');
const fixtures = [
  ...readdirSync(DIR).filter((f) => f.endsWith('.jsonl')),
  '06-subagent/session.jsonl',
].sort();

/**
 * THIS FILE IS THE STOP 2 GATE.
 *
 * It captures what the CURRENT, pre-refactor Claude pipeline produces for every fixture. The provider-neutral
 * refactor in Milestones 2 to 5 must not change any of it. When a snapshot moves, one of two things is true:
 * the refactor broke Claude behaviour, or the change was intended and the snapshot is updated deliberately in
 * the same commit that explains why. Silent drift is the thing this exists to make impossible.
 *
 * Snapshots are taken of a NORMALIZED projection, not the raw object: absolute paths and wall-clock values
 * would otherwise change per machine and per run, and a snapshot that cannot reproduce is a snapshot nobody
 * trusts enough to enforce.
 */

const RECENT_MS = 60 * 60 * 1000;

/** Replace values that vary by machine or by run, so the snapshot is about behaviour rather than environment. */
function stable(value: unknown): unknown {
  if (value instanceof Date) {
    // A date the parser defaulted to "now" (no timestamp in the source) is runtime state, not parsed output.
    return Math.abs(Date.now() - value.getTime()) < RECENT_MS ? '<RUNTIME_NOW>' : value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(stable);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = stable(v);
    }
    return out;
  }
  if (typeof value === 'string') {
    return value.replace(/\/Volumes\/[^"\s]*argus/g, '<REPO>');
  }
  return value;
}

/**
 * The snapshot is a SUMMARY, not the whole session.
 *
 * Snapshotting every step body would produce megabytes of noise in which a real regression is invisible, and
 * every incidental content change would show as a diff. What matters for parity is the shape the analyzer and
 * the UI consume: how many steps, of what types, in what order, with which tools, costs and findings.
 */
function summarize(session: any, analysis: any) {
  return stable({
    sessionId: session.sessionId,
    project: session.project,
    model: session.model,
    startTime: session.startTime,
    endTime: session.endTime,
    totalCost: session.totalCost,
    stepCount: session.steps.length,
    stepTypes: session.steps.map((s: any) => s.type),
    toolSequence: session.steps.map((s: any) => s.toolName ?? null).filter(Boolean),
    toolsUsed: session.toolsUsed,
    filesRead: session.filesRead?.length ?? 0,
    filesWritten: session.filesWritten?.length ?? 0,
    usage: session.usage,
    errorCount: session.steps.filter((s: any) => s.isError).length,
    findings: analysis?.findings?.map((f: any) => ({ type: f.type, severity: f.severity, title: f.title })) ?? [],
  });
}

describe('Claude pipeline parity', () => {
  const parser = new ParserService();
  const analyzer = new AnalyzerService();

  for (const fixture of fixtures) {
    it(`normalizes ${fixture} identically to the recorded baseline`, async () => {
      const events = await parser.parseFile(join(DIR, fixture));
      const session = parser.buildSession(events, fixture.replace('.jsonl', ''), 'fixture prompt', 'fixture-project');
      const analysis = analyzer.analyze(session, 'en');
      expect(summarize(session, analysis)).toMatchSnapshot();
    });
  }

  // A fixture that parses to zero steps exercises no parsing at all, and a re-harvest that picks a thinner
  // source would silently weaken the suite while staying green. These categories must yield work.
  it.each([
    ['02-bash-success.jsonl', 1],
    ['03-bash-failure.jsonl', 3],
    ['04-read-write-edit.jsonl', 3],
    ['05-multi-tool.jsonl', 3],
    ['07-retry-loop.jsonl', 3],
    ['09-compaction.jsonl', 10],
    ['13-unicode-path-or-content.jsonl', 2],
    ['15-cancelled-interrupted.jsonl', 3],
  ])('%s yields at least %i steps', async (fixture, min) => {
    const events = await parser.parseFile(join(DIR, fixture));
    const session = parser.buildSession(events, 'x', 'p', 'proj');
    expect(session.steps.length).toBeGreaterThanOrEqual(min);
  });

  // A corrupt or half-written line must not take the session down with it. This is the behaviour Codex and
  // Hermes will need too, so it is pinned here before the refactor rather than rediscovered after.
  it('survives a malformed line without losing the surrounding records', async () => {
    const events = await parser.parseFile(join(DIR, '10-malformed-line.jsonl'));
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it('survives a truncated final line', async () => {
    const events = await parser.parseFile(join(DIR, '11-truncated-final-line.jsonl'));
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});
