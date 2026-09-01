# Script Inventory

This file describes runnable scripts, task runners, and automation entrypoints in this project.

<!-- BEGIN MANAGED: skill-ai-it:scripts --> <!-- skill-ai-it-version: 2026-08-11-governance-checks-layer-v1 -->

## Execution Policy

- Prefer the existing canonical task runner for this project.
- Prefer `just <task>` when a `justfile` is present.
- Do not run scripts marked `destructive`, `review-required`, or `unknown` without review.
- Do not assume arbitrary files under `scripts/` are safe.
- If a script is missing from this inventory, inspect it before use and update or propose an inventory entry.
- Secrets must not be documented here as values. Document only secret names and where they are expected to come from.

## Preferred Execution Order

1. Existing canonical task runner (whichever is established for this project)
2. `just --list` / `just <task>`
3. `scripts/README.md`
4. Other task runners: `Taskfile.yml`, `Makefile`, `package.json`
5. Raw scripts under `scripts/` after inspection

## Maintenance Rules

- Keep this file aligned with: `justfile`, `Taskfile.yml`, `Makefile`, `package.json`, actual files under `scripts/`
- Prefer managed block updates for generated sections.
- Preserve manually written notes unless explicitly replacing them.
- When removing a script, remove or mark its inventory entry stale.
- When adding a script, document purpose, inputs, outputs, safety, idempotency, and when to use it.

<!-- END MANAGED: skill-ai-it:scripts -->

## Inventory

Every script here is stdlib-only or uses the pinned Node runtime, and is invoked through `just` rather than directly. `just doctor` prints the interpreters that will actually be used.

| Script                | Task                    | Purpose                                            | Inputs               | Outputs                          | Safety                 | Idempotent |
| --------------------- | ----------------------- | -------------------------------------------------- | -------------------- | -------------------------------- | ---------------------- | ---------- |
| `baseline-gates.sh`   | `just baseline`         | Runs every quality gate and records pass or fail   | none                 | logs under                       | `safe`, `long-running` | yes        |
|                       |                         |   for each, exiting with the failure count         |                      |   `tools-runtime/argus/logs/`,   |                        |            |
|                       |                         |                                                    |                      |   VSIX under                     |                        |            |
|                       |                         |                                                    |                      |   `tools-runtime/argus/`         |                        |            |
| `fixture-scan.py`     | `just fixture-scan`     | Classifies local transcripts against the 15        | `~/.claude/projects` | stdout, optional JSON via        | `safe`                 | yes        |
|                       |                         |   fixture categories; prints paths and counts      |   read-only          |   `--json`                       |                        |            |
|                       |                         |   only, never content                              |                      |                                  |                        |            |
| `refresh-pricing.mjs` | `just pricing-refresh`, | Refreshes and drift-checks the vendored model      | LiteLLM dataset over | `src/pricing/model-pricing.json` | `safe`,                | yes        |
|                       |   `just pricing-check`  |   pricing table                                    |   HTTPS              |                                  |   `external-network`,  |            |
|                       |                         |                                                    |                      |                                  |   `modifies-files`     |            |
| `make-fixtures.py`    | `just fixtures`         | Harvests and sanitizes the Claude fixture corpus,  | `~/.claude/projects` | `tests/fixtures/claude/`         | `review-required`,     | yes        |
|                       |                         |   synthesizes the three failure modes, and         |   read-only          |                                  |   `modifies-files`     |            |
|                       |                         |   verifies no secret survived                      |                      |                                  |                        |            |
| `check_governance.py` | `just check`            | Turns the project governance claims into           | repository tree      | stdout, non-zero exit on any     | `safe`                 | yes        |
|                       |                         |   assertions that fail                             |                      |   failure                        |                        |            |

### Why `make-fixtures.py` is `review-required`

It reads real session transcripts and writes sanitized copies into a repository that is public. Its redaction pass is followed by a verification pass that re-reads every written file and fails on any
surviving home path, username, employer domain, API token, AWS key, JWT or private key — and `tests/fixtures.test.ts` asserts the same properties on every test run, so a hand-edited fixture cannot
reintroduce a leak unnoticed. Read the diff before committing regenerated fixtures anyway. The verification pass caught exactly one real regression during authoring, when a refactor dropped the
`redact()` call and produced structurally perfect fixtures carrying the operator home path.
