import { defineConfig } from 'vitest/config';

// Unit and contract tests for the vscode-free core: services, adapters, normalized model, pricing.
// The webview and the providers import `vscode` and are not covered here; they need the extension host
// and are integration territory (Milestone 11), not something to fake with a module mock. A mock of the
// host would test the mock.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Snapshots are the Stop 2 parity mechanism: the pre-refactor normalized output is captured once,
    // and every later change is diffed against it. Keeping them beside the tests makes the diff reviewable.
    snapshotFormat: { printBasicPrototype: false },
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/types/**', 'src/utils/**', 'src/core/**', 'src/adapters/**', 'src/pricing/**'],
      exclude: ['**/*.d.ts'],
      reportsDirectory: '/Volumes/Data/_ai/_tool/tools-runtime/argus/coverage',
    },
  },
});
