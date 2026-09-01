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

## Expected outcome

All six gates pass: install, lint, compile, build:webview, test, package. `failed gates: 0`.

Lint reports four `no-unused-vars` warnings inherited from upstream. Warnings do not fail the gate.

### History

Until Milestone 2.1 the `test` gate failed with `MODULE_NOT_FOUND`, because `package.json` declared a test script pointing at a path that had never existed in the thirty-six-commit upstream history and
no runner was present in the dependency tree. That was finding F1, and it was recorded rather than hidden. Commit `5e24a3d` wired vitest and closed it. This paragraph is kept because a reader who finds
an old branch or an old VSIX needs to know that a red `test` gate there is the known baseline state, not a new regression.

## Do not

Do not redefine a failing gate as green by removing or ignoring it. The gates are all passing now, so any red gate is a live regression rather than a known state — which is precisely the condition this
procedure exists to surface.
