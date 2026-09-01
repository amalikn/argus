# Architecture — Argus Multi-Agent Observability Fork

Describes the fork as it stands at Milestone 1, and the target shape the plan moves it toward. Where the two differ, both are stated: the current column is measured, the target column is designed.

## Overview

A VS Code extension that reads AI coding-agent session transcripts off local disk, normalizes them, analyzes them, and renders them as inspectable timelines, cost views and dependency graphs. It is
forensic and read-only: it never writes to an agent evidence store, and it makes no network call at runtime.

Upstream reads Claude Code only. The fork adds OpenAI Codex and Hermes behind a common adapter contract, so a fourth agent becomes an adapter rather than a rewrite.

## Current components (measured 20260901 at commit 3bfbd8b)

| Component          | File                                           | Lines       | Role                                                                                  |
| ------------------ | ---------------------------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| Entry point        | `src/extension.ts`                             | 316         | Activation, command registration, session-list file watcher                           |
| Discovery          | `src/services/discoveryService.ts`             | 320         | Locates `~/.claude/projects/<project>/*.jsonl`, fixed depth                           |
| Parser             | `src/services/parserService.ts`                | 506         | Streams JSONL via readline, builds steps, resolves subagents, computes cost           |
| Analyzer           | `src/services/analyzerService.ts`              | 559         | Six rules over parsed steps                                                           |
| Raw provider types | `src/types/parser.ts`                          | 116         | Claude-shaped records: `RawEvent`, `ToolUseResult*`                                   |
| Domain types       | `src/types/models.ts`                          | 258         | `SessionSummary`, `SessionDetail`, `Step`, `Usage`, plus a second cost implementation |
| Session list UI    | `src/providers/sessionListViewProvider.ts`     | 1138        | Tree view, filtering, grouping                                                        |
| Session detail UI  | `src/providers/sessionWebviewProviderReact.ts` | 370         | Webview host; also owns live `fs.watch`                                               |
| Date filter UI     | `src/providers/datePickerPanel.ts`             | 147         |                                                                                       |
| Path resolution    | `src/utils/claudePaths.ts`                     | 15          | Honours `CLAUDE_CONFIG_DIR`                                                           |
| Webview            | `webview/src/**`                               | ~4733       | React 19, 14 components, charts, dependency graph                                     |
| Pricing data       | `src/pricing/model-pricing.json`               | 2571 models | Vendored LiteLLM dataset, added by the fork                                           |

The UI is the larger half of the codebase. The core model refactor is not the biggest chunk of work; provider-neutralizing the webview is.

## Target layering

Raw source files and streams feed provider adapters. Adapters emit a normalized model. Everything downstream consumes only the normalized model.

```text
Raw JSONL / logs / SQLite
        |
  Agent Source Adapter        <- the only place provider branching is allowed
  (claude-code | openai-codex | hermes)
        |
  Normalized Agent Model      <- AgentSession, AgentEvent union, capabilities, diagnostics
        |
  +-- Analyzer engine
  +-- Timeline and steps
  +-- Cost and context views
  +-- Dependency graph
  +-- Search and filters
  +-- Live watcher
  +-- Export
```

## Key decisions and constraints

| Decision                                                                   | Rationale                                                                                                               |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Provider-specific records never reach the analyzer or UI as the primary    | Otherwise every new agent is a change to every consumer, which is the rewrite the fork exists to avoid                  |
|   model                                                                    |                                                                                                                         |
| A missing metric is `undefined`, never zero, never a fallback rate         | Zero and unknown are different claims. The upstream code conflates them and prices unknown models at Anthropic rates    |
| Capability flags gate the UI                                               | A provider that exposes no cost shows no cost panel, rather than a convincing zero                                      |
| Derived facts carry a confidence marker                                    | Codex has a usable type discriminant; Hermes rows are chat-shaped, so lifecycle and subagent structure must be inferred |
| Evidence stores are read-only                                              | The tool is forensic. Writing into a scanned directory would also re-ingest its own output as a session that never ran  |
| Pricing is vendored, refreshed by a developer script                       | Local-first forbids a runtime fetch; provenance in the file makes a stale price visible rather than silent              |
| Parsing streams, never whole-file reads                                    | Codex rollouts and long Claude sessions are large; the upstream parser already streams, so the pattern is established   |
| Unknown events are data, not errors                                        | A parser that throws on an unrecognized record fails the moment a provider ships a new event type                       |

## Known structural obstacles

- **No test harness exists.** `package.json` declares a test script pointing at a path that has never existed. The parity snapshot the refactor must preserve has nowhere to live until this is fixed.
- **Live watching lives in the webview provider**, not a service. Moving `watch()` onto the adapter means extracting it from a UI class.
- **Cost is implemented twice**, in `parserService.ts` and `types/models.ts`, from two disagreeing hardcoded tables.
- **Subagents are sibling files**, at `<projectDir>/<sessionId>/subagents/`, not inline records. The normalized model must link them by `parentSessionId` rather than assume nesting.

## Related documents

- [docs/argus-multi-agent-implementation-plan-20260901_1708.md](docs/argus-multi-agent-implementation-plan-20260901_1708.md) — the governing plan
- [docs/architecture/current-state-audit.md](docs/architecture/current-state-audit.md) — the measured baseline and findings F1 to F12
- [ROADMAP.md](ROADMAP.md) — milestone sequence and stop gates
