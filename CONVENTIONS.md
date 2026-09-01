# Conventions — Argus Multi-Agent Observability Fork

Project-specific conventions only. Language defaults are not restated here.

## Naming

| Thing                  | Pattern                                              | Example                                                                             |
| ---------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Time-bound documents   | `<slug>-YYYYMMDD_hhmm.md`                            | `argus-multi-agent-implementation-plan-20260901_1708.md`      <!-- path:example --> |
| Stable entrypoints     | exact fixed names, never renamed                     | `README.md`, `AGENTS.md`, `SCRATCHPAD.md`                                           |
| Adapter directories    | `src/adapters/<provider-id>/`                        | `src/adapters/openai-codex/`                                  <!-- path:example --> |
| Provider ids           | lowercase, hyphenated, open-ended type               | `claude-code`, `openai-codex`, `hermes`                                             |
| Normalized event kinds | dotted, lowercase                                    | `shell.command`, `file.edit`, `mcp.call`                                            |
| Scripts                | verb-first, hyphenated, extension states the runtime | `refresh-pricing.mjs`, `baseline-gates.sh`, `fixture-scan.py` <!-- path:example --> |

## Test fixture layout

| Path                                 | Convention                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/fixtures/claude/`             | One file per category, named `NN-slug.jsonl`. Harvested and sanitized from real transcripts                                                                   |
| `tests/fixtures/claude/06-subagent/` | A DIRECTORY, not a file: `session.jsonl` beside `session/subagents/agent-*.jsonl`. Claude stores a subagent as a sibling directory, so a single file cannot   |
|                                      |   represent one                                                                                                                                               |
| `tests/fixtures/codex/`              | One file per category. Harvested and sanitized; two rollout format generations are represented                                                                |
| `tests/fixtures/hermes/`             | SYNTHESIZED from the observed schema, never harvested. Hermes sessions are personal conversations                                                             |
| `tests/__snapshots__/`               | Generated behavioural baselines. A moved snapshot is a behaviour change and needs the same review as a code change                                            |

## Runtime and invocation

- Every task goes through `just`. Recipes resolve interpreters by absolute path; `just doctor` prints what resolved.
- Never call a bare `python3`, `node`, `npx` or `ruby` in a recipe or script. The governance checker fails the build on it.
- Python is the venv at `tools-working-cache/argus/venv`. Node comes from the `.mise.toml` pin. Neither lives in the repo.
- Logs, VSIX output and npm cache go to `tools-runtime/argus/` and `tools-working-cache/argus/`. Nothing rebuildable is committed.

## TypeScript

- Normalized types are discriminated unions on a literal `kind`. Do not use optional fields to distinguish event classes.
- `AgentProviderId` stays open (`(string & {})`) so a new provider does not require editing core types.
- Optional metric fields mean unknown. Do not default them to zero at any layer, including display.
- Provider-specific data travels in a namespaced extension field, never by widening a normalized type.
- Prefer streaming reads. `readFileSync` on a transcript is a defect, not a style choice.

## Markdown

- Prose hard-wraps at 200 columns. Tables and fenced code are exempt.
- Any file over 100 lines carries a `## Contents` block linking its `##` headings, maintained on every edit.
- Tables are authored one row per line, unpadded, then wrapped by the table tool. Never hand-align columns.
- `just fmt-doc FILE` applies both passes in the right order.

## Comments

- Comments and docstrings wrap at 160 columns.
- Explain why, not what. A comment restating the line above it is noise; a comment recording the failure a guard exists to prevent is the reason the guard survives the next refactor.

## Git

- Small semantic commits. Subject plus a structured body: Summary, Why, Scope, Behavior, Validation, Risks, Follow-up.
- Never squash away upstream history. Never move the `baseline-upstream-argus` tag.
- `upstream` is fetch-only by configuration. Do not restore its push URL.
- Commits here are authored `djmalik@gmail.com`, applied automatically by the global `hasconfig:remote.*.url` include.

## Anti-patterns

| Pattern                                                               | Why it is wrong                                                                     |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `if (providerId === "claude") ... else if ...` in UI or analysis code | The adapter contract exists precisely so this does not spread. Use capability flags |
| Defaulting a missing token count or cost to `0`                       | Presents an unknown as a measurement. The user cannot tell the difference           |
| Falling back to another model rates when a model is unrecognized      | Produces a confident wrong number. Return undefined instead                         |
| Reading a whole transcript into memory                                | Rollouts reach hundreds of megabytes                                                |
| Writing exports or caches into a scanned provider directory           | The next discovery pass ingests them as sessions that never ran                     |
| Broadening a governance check to make a run green                     | Converts a real finding into a permanent blind spot                                 |
| Adding a settings key nothing reads                                   | Upstream already ships two. They appear in the settings UI and do nothing           |
