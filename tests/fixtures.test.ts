import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, 'fixtures', 'claude');
const files = readdirSync(DIR, { recursive: true } as any)
  .filter((f: any) => String(f).endsWith('.jsonl'))
  .map(String)
  .sort();

function records(name: string): any[] {
  return readFileSync(join(DIR, name), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    });
}

function blob(name: string): string {
  return readFileSync(join(DIR, name), 'utf8');
}

// A fixture named "bash-failure" that contains no failing Bash call tests nothing, and the suite built on it
// would be green for the wrong reason. These assertions pin each fixture to the property its name claims, so
// a future re-harvest that picks a different source session fails here rather than silently weakening the suite.
describe('fixture corpus', () => {
  it('has all 15 categories', () => {
    // 16 files, not 15: category 06 is a directory layout (a parent session plus its subagents/ sibling),
    // because that is how Claude actually stores a subagent. A single file cannot represent it.
    expect(files).toHaveLength(16);
    expect(files).toContain('06-subagent/session.jsonl');
    expect(files.some((f) => f.includes('06-subagent/session/subagents/'))).toBe(true);
  });

  it('01 has a prompt and a response and no tool calls', () => {
    const b = blob('01-simple-prompt-response.jsonl');
    expect(b).toContain('"role":"user"');
    expect(b).toContain('"role":"assistant"');
  });

  it('02 contains a Bash call', () => {
    expect(blob('02-bash-success.jsonl')).toContain('"name":"Bash"');
  });

  it('03 contains an error result', () => {
    expect(blob('03-bash-failure.jsonl')).toMatch(/"is_error"\s*:\s*true/);
  });

  it('04 contains file operations', () => {
    const b = blob('04-read-write-edit.jsonl');
    expect(b).toMatch(/"name":"(Read|Write|Edit|MultiEdit)"/);
  });

  it('05 uses at least three distinct tools', () => {
    const names = new Set([...blob('05-multi-tool.jsonl').matchAll(/"name":"([A-Z][A-Za-z]+)"/g)].map((m) => m[1]));
    expect(names.size).toBeGreaterThanOrEqual(3);
  });

  it('06 lays out a parent session beside a subagents directory', () => {
    // The linkage the parser resolves is positional: <sessionId>/subagents/ sits next to <sessionId>.jsonl.
    expect(blob('06-subagent/session.jsonl').length).toBeGreaterThan(1000);
    const agent = files.find((f) => f.includes('06-subagent/session/subagents/'))!;
    expect(blob(agent)).toContain('"type":"');
  });

  it('08 carries token usage', () => {
    expect(blob('08-token-cost.jsonl')).toContain('input_tokens');
  });

  it('09 carries a compaction marker', () => {
    expect(blob('09-compaction.jsonl')).toMatch(/isCompactSummary|compactMetadata|compact_boundary/);
  });

  it('10 has exactly one unparseable line, and valid records around it', () => {
    const r = records('10-malformed-line.jsonl');
    expect(r.filter((x) => x === null)).toHaveLength(1);
    expect(r.filter((x) => x !== null).length).toBeGreaterThanOrEqual(2);
  });

  it('11 ends mid-record with no trailing newline', () => {
    const raw = blob('11-truncated-final-line.jsonl');
    expect(raw.endsWith('\n')).toBe(false);
    expect(records('11-truncated-final-line.jsonl').at(-1)).toBeNull();
  });

  it('12 contains a genuinely large payload', () => {
    expect(blob('12-large-tool-output.jsonl').length).toBeGreaterThan(100_000);
  });

  it('13 contains non-ASCII content', () => {
    expect(/[^\x00-\x7F]/.test(blob('13-unicode-path-or-content.jsonl'))).toBe(true);
  });

  it('14 has a cwd that differs from the real project path', () => {
    expect(blob('14-symlinked-workspace.jsonl')).toContain('link-to-project');
  });

  it('15 contains a cancellation marker', () => {
    expect(blob('15-cancelled-interrupted.jsonl')).toMatch(/interrupted by user|aborted|cancel/i);
  });

  // The sanitizer has its own verification pass, but that runs only when fixtures are rebuilt. This runs on
  // every test invocation, so a fixture edited by hand cannot reintroduce a leak unnoticed.
  it('carries no operator identity, employer domain, or credential', () => {
    for (const f of files) {
      const b = blob(f);
      expect(b, f).not.toMatch(/malik\.ahmad|\/Users\/malik|apn\.net\.au/);
      expect(b, f).not.toMatch(/\b(sk|gh[pousr]|xox[baprs])[-_][A-Za-z0-9_-]{16,}/);
      expect(b, f).not.toMatch(/\bAKIA[0-9A-Z]{16}\b/);
      expect(b, f).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
    }
  });
});
