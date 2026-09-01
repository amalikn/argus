# Current State Audit — Upstream Argus Baseline

Milestone 1 deliverable. Produced 2026-09-01 before any architecture change.

## Contents

- [Scope and method](#scope-and-method)
- [Baseline gate results](#baseline-gate-results)
- [Conceptual role map](#conceptual-role-map)
- [Findings](#findings)
- [Fixture inventory](#fixture-inventory)
- [Cost and pricing: decision and implementation](#cost-and-pricing-decision-and-implementation)
- [Environment and routing](#environment-and-routing)
- [Repository additions in Milestone 1](#repository-additions-in-milestone-1)
- [Not verified](#not-verified)
- [Effect on the remaining milestones](#effect-on-the-remaining-milestones)

---

## Scope and method

Audits the upstream repository as cloned, records the real result of every quality gate it exposes, maps its code to the conceptual roles the implementation plan assumes, and inventories the local
Claude transcripts available as fixtures. No source file was modified. Every claim below was produced by running something, not by reading the plan.

| Item             | Value                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| Upstream         | `https://github.com/yessGlory17/argus`                                 |
| Baseline commit  | `3bfbd8b9f9adc28ace2bcc18a0f71bd05c5b686a` (`update version to 0.3.1`) |
| Baseline tag     | `baseline-upstream-argus`                                              |
| Work branch      | `feat/multi-agent-observability`                                       |
| Upstream history | 36 commits, preserved, not squashed                                    |
| License          | MIT, retained                                                          |
| Package identity | name `argus-claude`, publisher `argus-claude`, version `0.3.1`         |
| VS Code engine   | `^1.80.0`                                                              |
| Node runtime     | 22.23.2, pinned in `.mise.toml`                                        |
| Audit date       | 2026-09-01                                                             |

Remote naming departs from the plan deliberately. `origin` was renamed to `upstream` and no `origin` exists yet, so no push can reach the upstream repository by accident. Creating the GitHub fork is
an outward-facing action and is left for explicit approval; it is the only part of plan section 2 not yet done.

## Baseline gate results

Reproduce with `just baseline`. Logs under `tools-runtime/argus/logs/`.

| Gate          | Command                 | Result | Notes                                      |
| ------------- | ----------------------- | ------ | ------------------------------------------ |
| install       | `npm ci`                | PASS   | lockfile clean, no audit failures blocking |
| lint          | `npm run lint`          | PASS   | 0 errors, 4 warnings, all `no-unused-vars` |
| compile       | `npm run compile`       | PASS   | `tsc -p ./` clean                          |
| build:webview | `npm run build:webview` | PASS   | vite 7, warns that a chunk exceeds 500 kB  |
| test          | `npm test`              | **FAIL**   | `MODULE_NOT_FOUND` — see finding F1        |
| package       | `vsce package`          | PASS   | 39 files, 1.72 MB VSIX                     |

The baseline is therefore green on five of six gates, with the sixth failing because the gate does not exist rather than because the code is broken.

## Conceptual role map

The plan section 3 asked whether the upstream still contains the concepts it assumes. It does, almost exactly, which lowers the risk of Milestone 3 considerably.

| Plan concept           | Real file                                      | Lines | Notes                                                                          |
| ---------------------- | ---------------------------------------------- | ----- | ------------------------------------------------------------------------------ |
| extension entry point  | `src/extension.ts`                             | 316   | `activate` / `deactivate`, command registration, one `createFileSystemWatcher` |
| discovery              | `src/services/discoveryService.ts`             | 320   | `DiscoveryService`, `DiscoveredSession`, `DiscoveryResult`                     |
| JSONL parser           | `src/services/parserService.ts`                | 506   | `ParserService`, streams via `readline`                                        |
| analyzer               | `src/services/analyzerService.ts`              | 559   | `AnalyzerService`, `AnalysisRule`, 6 rules                                     |
| Claude-specific types  | `src/types/parser.ts`                          | 116   | `RawEvent`, `ToolUseResultRead/Bash/Write/Agent` — the raw provider records    |
| domain types           | `src/types/models.ts`                          | 258   | `SessionSummary`, `SessionDetail`, `Step`, `Usage`, `SubagentInfo`             |
| session list provider  | `src/providers/sessionListViewProvider.ts`     | 1138  | largest single file in `src/`                                                  |
| session detail webview | `src/providers/sessionWebviewProviderReact.ts` | 370   | also owns live watching — see F4                                               |
| date filter UI         | `src/providers/datePickerPanel.ts`             | 147   |                                                                                |
| path resolution        | `src/utils/claudePaths.ts`                     | 15    | honours `CLAUDE_CONFIG_DIR`, falls back to `~/.claude`                         |
| webview UI             | `webview/src/**`                               | ~4733 | React 19, 14 components, dependency graph, charts                              |

Total TypeScript and TSX: 8478 lines, of which `src/` is 3745 and the webview is the remainder. The UI is the larger half of the codebase, which makes plan section 15 the single biggest chunk of work
rather than the core model refactor.

Absent entirely: `src/test/`, `.github/`, any CI config, any localization resource files, any cache or persistence layer.

## Findings

Ordered by impact on the remaining milestones.

### F1 — There is no test infrastructure at all

`package.json` declares `"test": "node ./out/test/runTest.js"`, but `src/test/` does not exist, `out/test/` is never produced, and no test runner appears anywhere in the dependency tree — no mocha,
jest, vitest, or `@vscode/test-electron`. The gate fails with `MODULE_NOT_FOUND` on a path that has never existed in the 36-commit history.

This is the most consequential finding. Plan sections 9, 26, 27, 28, 31 and 32 all describe a regression and contract test strategy, and Stop 2 is defined as "every fixture normalizes identically to
the pre-refactor snapshot". None of that is expressible today. Choosing and wiring a test framework becomes the first task of Milestone 2, ahead of the domain model, because the snapshot of current
Claude behaviour that Milestone 3 must preserve has nowhere to live until it exists.

### F2 — The two declared settings are dead

`package.json` contributes `argus.scanDepth` and `argus.language`. Neither string appears anywhere in `src/` or `webview/`, and there is no `getConfiguration` call in the entire codebase. They are
declared, shown in the VS Code settings UI, and read by nothing.

This changes plan section 38. There is no behaviour to preserve for backward compatibility, only two key names that users may have set. It also removes two items from the plan section 9 must-preserve
list: "existing settings" and "existing language support" describe capabilities the baseline does not have.

### F3 — Discovery is fixed-depth, not recursive

`discoveryService.scanProjectsDir` reads `<claudeDir>/projects/<project>/*.jsonl` and explicitly skips directories, with the comment "Only include direct .jsonl children (not in subdirectories like
subagents/)". There is no depth parameter and no recursion.

Plan section 9 lists "recursive session discovery" as a behaviour to preserve. It does not exist. The multi-source discovery coordinator in plan section 13 should be designed against what Codex
actually needs — date-partitioned directories — rather than against a recursion the Claude adapter never had.

### F4 — Live watching lives in the UI layer, not a service

Two independent mechanisms exist. `extension.ts:285` creates a `vscode.workspace.createFileSystemWatcher` for the session list. `sessionWebviewProviderReact.ts:181` and `:193` call raw `fs.watch` on
the session file and on the subagents directory, inside the webview provider.

The adapter contract in plan section 7 places `watch()` on the adapter. Extracting it means pulling watch logic out of a UI class that currently owns it, not relocating a service that already exists.
Milestone 3 should budget for that; it is the least mechanical part of the Claude migration.

### F5 — Cost is computed twice, from two different hardcoded tables, and one of them is wrong

`types/models.ts:242-258` defines `MODEL_PRICES`, `getModelPricing` and `calculateCost`. `parserService.ts:489-505` defines a second private `calculateCost` with its own inline price map and a comment
reading "Import from models.ts would be better, but for simplicity". The two tables do not agree with each other in structure, and neither agrees with published pricing.

Checked against the LiteLLM dataset on 2026-09-01:

| Model                        | Baseline hardcoded         | LiteLLM published         | Error              |
| ---------------------------- | -------------------------- | ------------------------- | ------------------ |
| `claude-opus-4-6`            | 15.00 in / 75.00 out per M | 5.00 in / 25.00 out per M | 3x overstatement   |
| `claude-haiku-4-5-20251001`  | 0.80 in / 4.00 out per M   | 1.00 in / 5.00 out per M  | 20% understatement |
| `claude-sonnet-4-5-20250929` | 3.00 in / 15.00 out per M  | 3.00 in / 15.00 out per M | correct            |

Both implementations also hardcode cache ratios of 0.1 for reads and 0.25 for writes rather than using published per-token cache prices, and both ignore the tiered above-200k pricing that long
sessions routinely cross.

Worse for a provider-neutral fork: both fall back to Sonnet pricing for any unrecognized model. A Codex or Hermes session would be silently costed at Anthropic rates. That directly violates the plan
section 5 rule that a missing metric must be `undefined` rather than synthesized.

### F6 — Zero telemetry and zero outbound network calls

No `fetch`, no HTTP client, no analytics library, no telemetry strings anywhere in `src/` or `webview/`. Plan section 20 asked for an explicit telemetry audit of upstream; the answer is that there is
nothing to remove. This should be locked in with a CI grep guard so it stays true as the fork grows, rather than re-audited later.

### F7 — There is no cache or persistence layer

No use of `globalState`, `workspaceState`, or `globalStorageUri`. `ExtensionContext` is passed to the providers but only for webview resource roots. Plan section 22 is therefore greenfield rather than
a refactor, which is lower risk than the plan assumes.

### F8 — The parser already streams

`parserService.ts` uses `fs.createReadStream` with `readline` rather than reading whole files. One `readFileSync` remains, at line 393, for subagent metadata. The streaming requirement in plan section
23 is already satisfied for Claude, so the Codex adapter can follow an established pattern in this codebase instead of introducing one.

### F9 — The analyzer has exactly six rules

Duplicate File Reads, Potentially Unused Reads, Retry Loop Detected, Failed Tool Calls, High Context Pressure, Context Compaction. Severities span info, warning and error. This is the complete set
that plan section 9 requires Milestone 3 to preserve and plan section 16 requires Milestone 9 to port — smaller than the plan section 9 wording implies.

### F10 — No CI exists upstream

No `.github/` directory. Plan section 42 is greenfield.

### F11 — Extension identity must change in two places

Both `name` and `publisher` are `argus-claude`. Plan section 39 requires an ID that cannot collide with upstream; that means changing both fields, not just the display name.

### F12 — Subagent storage is a sibling directory, not inline

`parserService` resolves subagents at `<projectDir>/<sessionId>/subagents/` and reads them as separate files. 96 of the scanned local sessions have such a directory. The normalized model must treat a
subagent as a separate discovered source that links back by `parentSessionId`, rather than assuming child events are inline in the parent transcript. Codex and Hermes both differ here, so this is the
first real test of the `parentSessionId` and `rootSessionId` fields.

## Fixture inventory

Reproduce with `just fixture-scan`. The scan reports paths and counts only, never transcript content.

| Metric                                 | Value     |
| -------------------------------------- | --------- |
| Sessions scanned                       | 10,072    |
| Total lines                            | 1,018,178 |
| Total bytes                            | 5.03 GB   |
| Undecodable JSON lines                 | 0         |
| Sessions with a `subagents/` directory | 96        |

Coverage against the 15 categories in plan section 9:

| Category                  | Sourceable | Note                         |
| ------------------------- | ---------- | ---------------------------- |
| 01 simple prompt/response | yes        |                              |
| 02 bash success           | yes        |                              |
| 03 bash failure           | yes        |                              |
| 04 read/write/edit        | yes        |                              |
| 05 multiple tool calls    | yes        |                              |
| 06 subagent               | yes        | 96 candidate sessions        |
| 07 retry loop             | yes        |                              |
| 08 token/cost events      | yes        |                              |
| 09 compaction             | yes        |                              |
| 10 malformed JSON line    | **no**         | must be synthesized          |
| 11 truncated final line   | **no**         | must be synthesized          |
| 12 very large tool output | yes        | 300-1270 KB candidates found |
| 13 unicode paths/content  | yes        |                              |
| 14 symlinked workspace    | **no**         | must be synthesized          |
| 15 cancelled/interrupted  | yes        |                              |

Twelve of fifteen categories can be harvested from real transcripts. The three gaps are all failure modes that a healthy transcript store does not contain by construction, so they are synthesized by
hand rather than found; the scan marks them `SYN` rather than `GAP` for that reason. Zero undecodable lines across one million lines is itself a finding: Claude JSONL is clean in practice, so the
malformed-input handling in plan section 24 will only ever be exercised by synthetic fixtures unless Codex or Hermes prove dirtier.

Sanitized extraction of the fixtures themselves is deliberately deferred to Milestone 2, because there is no harness to consume them until F1 is resolved, and sanitizing 5 GB of real transcripts
before knowing the fixture format would be wasted work. The inventory above is what makes that deferral safe: every category is known to be available.

## Cost and pricing: decision and implementation

The operator asked where multi-provider cost data would come from and pointed at CodeBurn as a reference.

**Source selected.** The LiteLLM public dataset at `https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json` (BerriAI/litellm, MIT). Verified 2026-09-01: HTTP 200,
2.0 MB, 3408 models, covering anthropic, openai, bedrock, azure, gemini and roughly 40 other providers with `input_cost_per_token`, `output_cost_per_token`, `cache_read_input_token_cost`,
`cache_creation_input_token_cost`, tiered above-threshold variants, and `max_input_tokens`.

**Reference.** CodeBurn (`https://github.com/getagentseal/codeburn`, MIT, TypeScript, 9791 stars, pushed 2026-09-01) solves the same problem for the same three agents and normalizes that dataset into
a compact per-model shape. Its local cache at `~/.cache/codeburn/litellm-pricing.json` carries `{version, timestamp, data}` with 4592 normalized models and a `cacheWriteCostIsExplicit` flag that
distinguishes a published cache-write price from a derived one. The normalized field names used here follow that shape so the two remain comparable. The implementation is independent, not copied.

**What was built.** `scripts/refresh-pricing.mjs`, driven by `just pricing-refresh` and `just pricing-check`, plus the vendored output at `src/pricing/model-pricing.json`.

| Property                         | Decision                                                           | Reason                                                                                       |
| -------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Vendored, not fetched at runtime | vendored                                                           | Plan section 20 forbids runtime network access. Refresh is a developer action.               |
| Provenance recorded              | url, repo, license, etag, `retrievedAt`, `upstreamSha256`          | A stale price becomes visible rather than silent.                                            |
| Unknown model                    | absent from the table                                              | Consumer reports unknown, never zero and never a fallback rate. Fixes the F5 fallback bug.   |
| Cache-write price                | emitted only when published, with `cacheWriteCostIsExplicit: true` | A derived number wearing a real field name is worse than no number. CodeBurn derives; this   |
|                                  |                                                                    |   does not.                                                                                  |
| Tiered pricing                   | retained verbatim under `tiers`                                    | Which tier applies depends on per-turn context size that only the parser knows.              |
| Scope filter                     | chat, responses and completion modes only                          | 2571 of 3408 models kept, 578 KB vendored. Embedding and image models cost nothing this tool |
|                                  |                                                                    |   reads.                                                                                     |
| Drift detection                  | `--check` compares upstream sha256, reports                        | Can gate CI later.                                                                           |
|                                  |   added/removed/repriced, exits non-zero                           |                                                                                              |

**Deferred to Milestone 2.** The TypeScript `PricingProvider` that consumes this table and replaces both hardcoded implementations from F5 is an architecture change and is out of scope for Milestone
1. Its contract: resolve a model id to a rate record or `undefined`; never fall back to another model; expose whether cache-write pricing is explicit; and drive the `cost` capability flag per plan
section 7 so a provider with no usage data shows no cost panel rather than a zero.

## Environment and routing

| Concern           | Location                                                                            |
| ----------------- | ----------------------------------------------------------------------------------- |
| Fork working tree | `/Volumes/Data/_ai/_tool/tools_stuff/argus/`                                        |
| Node runtime      | mise pin `node = "22"` in `.mise.toml`, resolved 22.23.2                            |
| Python runtime    | mise pin `python = "3.14"`, venv at `tools-working-cache/argus/venv` running 3.14.7 |
| npm cache         | `tools-working-cache/argus/npm-cache` via exported `npm_config_cache`               |
| Gate logs         | `tools-runtime/argus/logs/`                                                         |
| VSIX output       | `tools-runtime/argus/`                                                              |
| Task runner       | `justfile`; `just doctor` prints every resolved interpreter path                    |

| Recipe shell | `/opt/homebrew/bin/bash` 5.3.15 with `-euo pipefail`, pinned via `set shell` |
Every justfile recipe invokes an absolute interpreter path rather than inheriting one from `PATH`, so no recipe can silently run against the host Homebrew node or the system python.

## Repository additions in Milestone 1

No existing source file was modified. Added:

| Path                                                          | Purpose                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------- |
| `.mise.toml`                                                  | node and python runtime pins                                         |
| `justfile`                                                    | task runner with explicit interpreter resolution                     |
| `scripts/baseline-gates.sh`                                   | runs every gate, records pass and fail, exits with the failure count |
| `scripts/fixture-scan.py`                                     | classifies transcripts against the 15 fixture categories             |
| `scripts/refresh-pricing.mjs`                                 | refreshes and drift-checks the vendored pricing table                |
| `src/pricing/model-pricing.json`                              | vendored pricing data, 2571 models, 578 KB                           |
| `docs/architecture/current-state-audit.md`                    | this document                                                        |
| `docs/argus-multi-agent-implementation-plan-20260901_1708.md` | the corrected plan                                                   |

## Not verified

| Item                                          | Why                                                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime behaviour of the extension            | Never launched in an Extension Development Host. Every gate above is static: build, lint, package. Nothing here proves the extension renders a |
|                                               |   session.                                                                                                                                     |
| Claude normalized output snapshot             | Blocked by F1. This is the Milestone 3 parity baseline and cannot be captured until a harness exists.                                          |
| Windows compatibility                         | Not tested. Upstream makes no explicit claim.                                                                                                  |
| Codex and Hermes adapters                     | Out of Milestone 1 scope. Their source layouts were verified during the plan review and are recorded in plan section 0.                        |
| Whether upstream has moved since the baseline | `just upstream-log` answers this at any time. Last upstream push was 2026-05-08.                                                               |

## Effect on the remaining milestones

| Milestone            | Effect                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| M2 core              | Grows. Test framework selection and wiring moves to the front, before the domain model. `PricingProvider` joins the scope.                |
| M3 Claude migration  | Slightly harder than planned because of F4: watch logic must be extracted from a webview provider. Otherwise the role map is a clean fit. |
| M4 UI neutralization | Largest single chunk, 4733 lines of React. Unchanged by these findings.                                                                   |
| M9 analysis          | Smaller than planned. Six rules, enumerated in F9.                                                                                        |
| M10 privacy          | Smaller than planned. F6 means there is no telemetry to strip, only a guard to add.                                                       |
| M11 CI and release   | Greenfield per F10. Extension identity change per F11.                                                                                    |
