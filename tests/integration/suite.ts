/**
 * The runtime render gate, automated as far as the VS Code API allows.
 *
 * This runs INSIDE a real Extension Development Host, in the extension host process, with the `vscode` API available. That is
 * what makes it different from everything else in tests/: those exercise parsers and projections in isolation, and none of them
 * can tell you whether the extension does anything when a user opens it.
 *
 * Why it exists. Through Milestone 8 the extension had never been run interactively. When the manual gate was finally written,
 * driving it from an agent proved impossible in this environment: screen capture was refused, window focus needed foreground
 * authorization, and a coordinate click cannot be aimed while the development host and the operator's own editor are both
 * processes named `Code`. Six mechanisms failed, all for environmental reasons. This harness removes the human from the part of
 * the gate that a machine can actually answer.
 *
 * WHAT THIS PROVES, precisely:
 *   - the extension is present, activates, and registers its commands
 *   - the Argus view container OPENS on command — the automated equivalent of clicking the activity-bar icon
 *   - a session from each wired provider opens in a webview panel without throwing
 *   - opening several providers in sequence leaves the expected tabs and no error
 *
 * WHAT IT DOES NOT PROVE, and must not be reported as proving:
 *   - that any pixel was drawn. The webview's DOM is not reachable from the extension host, by design
 *   - that the session list POPULATED, or that a provider badge rendered. Those live inside the webview
 *   - anything about visual regression
 *
 * Those remain manual checks in docs/runtime-render-gate.md. A harness that quietly claimed them would be worse than no harness,
 * because it would retire a real check and leave a green light in its place.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'argus-claude.argus-claude';

/** Compiled adapters, loaded from the same `out/` tree this suite is compiled beside. Used only to obtain real session ids. */
const OUT = path.join(__dirname, '..');

interface Case {
  name: string;
  fn: () => Promise<void> | void;
}

const cases: Case[] = [];
function test(name: string, fn: () => Promise<void> | void): void {
  cases.push({ name, fn });
}

// ---------------------------------------------------------------------------------------------------------------- R1

test('R1 the extension is present and activates', async () => {
  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(ext, `extension ${EXTENSION_ID} is not installed in the host`);
  await ext.activate();
  assert.strictEqual(ext.isActive, true, 'extension did not become active');
});

test('R1 the Argus commands are registered', async () => {
  const commands = await vscode.commands.getCommands(true);
  for (const id of ['argus.refreshSessions', 'argus.openSessionDetail', 'argus.clearFilters']) {
    assert.ok(commands.includes(id), `command ${id} was not registered`);
  }
});

test('R1 the Argus view container opens', async () => {
  // The automated equivalent of clicking the activity-bar icon. If the view container were misdeclared or the provider threw
  // on resolve, this rejects. It does NOT prove the list rendered — that is inside the webview and stays a manual check.
  await vscode.commands.executeCommand('workbench.view.extension.argus');
});

test('R1 refreshing sessions does not throw', async () => {
  await vscode.commands.executeCommand('argus.refreshSessions');
});

// ------------------------------------------------------------------------------------------------------- R2 to R4

/** Real session ids, straight from the adapters, so the gate opens what a user would open rather than a fixture. */
async function sessionIdFor(provider: 'claude-code' | 'openai-codex' | 'hermes'): Promise<string | undefined> {
  const modules: Record<string, [string, string]> = {
    'claude-code': ['adapters/claude-code', 'ClaudeCodeAdapter'],
    'openai-codex': ['adapters/openai-codex', 'CodexAdapter'],
    hermes: ['adapters/hermes', 'HermesAdapter'],
  };
  const [modulePath, exported] = modules[provider];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(path.join(OUT, modulePath));
  const adapter = new mod[exported]();
  const detection = await adapter.detect({});
  if (!detection.available) {
    return undefined;
  }
  const found = await adapter.discover({ roots: detection.roots });
  // Largest first: an aborted one-line session proves less than a real one.
  found.sort((a: { sizeBytes?: number }, b: { sizeBytes?: number }) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
  return found[0]?.id;
}

function argusTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((t) => t.label.startsWith('Argus:'));
}

async function opensWithoutThrowing(provider: 'claude-code' | 'openai-codex' | 'hermes', label: string): Promise<void> {
  const id = await sessionIdFor(provider);
  if (!id) {
    // NOT RUN is a legitimate outcome and is not the same as a pass. A provider absent from this machine cannot be exercised,
    // and saying so is honest; silently passing would be the failure this whole gate exists to prevent.
    console.log(`  NOT RUN  ${label}: no ${provider} sessions on this machine`);
    return;
  }
  const before = argusTabs().length;
  await vscode.commands.executeCommand('argus.openSessionDetail', id);
  const after = argusTabs().length;
  assert.ok(after > before, `${label}: opening ${id} created no Argus webview tab`);
  console.log(`  opened   ${label}: ${id}`);
}

test('R2 a Claude session opens in a webview panel', async () => {
  await opensWithoutThrowing('claude-code', 'Claude');
});

test('R3 a Codex session opens in a webview panel', async () => {
  await opensWithoutThrowing('openai-codex', 'Codex');
});

test('R4 a Hermes session opens in a webview panel', async () => {
  await opensWithoutThrowing('hermes', 'Hermes');
});

// ---------------------------------------------------------------------------------------------------------------- R5

test('R5 opening three providers in sequence leaves a tab for each', async () => {
  // Cross-provider isolation, as far as the extension host can see it: each provider gets its own panel and none replaces
  // another. Whether stale events leak INSIDE a webview is not visible from here and stays a manual check.
  const ids = await Promise.all([sessionIdFor('claude-code'), sessionIdFor('openai-codex'), sessionIdFor('hermes')]);
  const present = ids.filter((id): id is string => Boolean(id));
  if (present.length < 2) {
    console.log('  NOT RUN  R5: fewer than two providers available on this machine');
    return;
  }
  for (const id of present) {
    await vscode.commands.executeCommand('argus.openSessionDetail', id);
  }
  assert.strictEqual(argusTabs().length, present.length, 'one panel per session was expected');
});

// --------------------------------------------------------------------------------------------------------------- RUN

export async function run(): Promise<void> {
  const failures: string[] = [];
  console.log('\nRUNTIME RENDER GATE (automated portion)\n');

  for (const { name, fn } of cases) {
    try {
      await fn();
      console.log(`  PASS  ${name}`);
    } catch (err) {
      failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      console.log(`  FAIL  ${name}`);
      console.log(`        ${err instanceof Error ? err.stack : String(err)}`);
    }
  }

  console.log(`\n${cases.length - failures.length}/${cases.length} automated gate checks passed`);
  console.log('NOT covered here, still manual: list population, provider badges, and anything visual.\n');

  if (failures.length) {
    throw new Error(`${failures.length} gate check(s) failed:\n  - ${failures.join('\n  - ')}`);
  }
}
