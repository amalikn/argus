/**
 * Launches a real VS Code, loads this extension into it, and runs the in-host gate suite.
 *
 * This is the answer to a problem that cost an hour on 20260902: an agent cannot drive the Extension Development Host in this
 * environment. Screen capture is refused, window focus needs foreground authorization, and a coordinate click cannot be aimed
 * while the host and the operator's own editor are both processes named `Code`. Driving the host from INSIDE removes every one
 * of those obstacles, because there is no window to find and no cursor to aim.
 *
 * The VS Code build it downloads is rebuildable state and therefore lives in the working cache, never in the repository.
 */
import { runTests } from '@vscode/test-electron';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const CACHE = '/Volumes/Data/_ai/_tool/tools-working-cache/argus/vscode-test';

try {
  await runTests({
    extensionDevelopmentPath: repo,
    extensionTestsPath: path.join(repo, 'out', 'integration', 'suite.js'),
    vscodeExecutablePath: undefined,
    // A separate profile, for the same reason `just edh` uses one: the operator's own settings and extensions must not
    // decide whether this gate passes.
    launchArgs: [repo],
    // Downloaded VS Code builds are rebuildable; they belong in the working cache.
    cachePath: CACHE,
  });
} catch (err) {
  console.error('\nruntime render gate (automated portion) FAILED');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
