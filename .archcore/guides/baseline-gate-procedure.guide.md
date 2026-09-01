---
title: Running and recording the baseline gates
type: guide
status: accepted
date: 20260901
accepted: 20260901
source: scripts/README.md; scripts/baseline-gates.sh
tags: [process, tooling]
promoted_by: skill-ai-it promote
---

# Running and recording the baseline gates

## When

Before claiming any change builds, and whenever the upstream baseline needs re-measuring.

## Procedure

1. `just baseline` — runs install, lint, compile, build:webview, test and package.
2. Read the summary line. The script never stops at the first failure: a failing gate is a recorded fact, not an aborted run.
3. Exit status is the COUNT of failed gates, so `just` reports failure whenever any gate failed.
4. Logs land in `tools-runtime/argus/logs/`, one per gate, plus a timestamped report naming them.
5. `just baseline-quick` skips the VSIX build for a faster inner loop.

## Expected outcome as at 20260901

Install, lint, compile, build:webview and package pass. `test` fails with `MODULE_NOT_FOUND`, because `package.json` declares a test script pointing at a path that has never existed in the
thirty-six-commit upstream history and no runner is present in the dependency tree. That failure is finding F1 and is expected until Milestone 2 adds a harness.

## Do not

Do not redefine the baseline as green by removing or ignoring the failing gate. The failure is the finding.
