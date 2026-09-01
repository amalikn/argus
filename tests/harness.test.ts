import { describe, expect, it } from 'vitest';

// A harness that has never failed is an assumption wearing a test's clothes. This file exists so the
// harness itself is exercised on every run: if the runner, the TypeScript transform, or the include
// glob breaks, this goes red before any real test is even reached.
describe('test harness', () => {
  it('runs TypeScript and reports failures', () => {
    expect(1 + 1).toBe(2);
  });

  it('imports project source through the configured paths', async () => {
    const { getClaudeConfigDir } = await import('../src/utils/claudePaths');
    expect(typeof getClaudeConfigDir()).toBe('string');
  });
});
