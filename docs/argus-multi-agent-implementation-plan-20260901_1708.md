# Production Implementation Prompt: Fork Argus into a Multi-Agent Observability Platform

### Mission

Fork **Argus** (`yessGlory17/argus`) and evolve it from a Claude-Code-specific VS Code observability extension into a **provider-neutral, local-first, FOSS multi-agent observability platform**.

The first-class supported agents must be:

1. **Claude Code** — preserve all current Argus functionality with no regression.
2. **OpenAI Codex** — support Codex CLI and Codex sessions produced by OpenAI's local Codex clients where they share the same session/rollout format.
3. **Hermes Agent** — support Nous Research Hermes local activity/session/log sources.
4. **Future OpenAI/local coding agents** — make additional agent support an adapter/plugin exercise rather than a rewrite.

The platform must remain useful as a **VS Code-native session observability and forensic analysis tool**. It is not intended to replace Claude Code, Codex, Hermes, or the operating-system
security/audit layer.

The implementation must be production-oriented: typed interfaces, schema validation, tests, migration paths, fixture-driven parsers, defensive handling of corrupted or evolving logs, privacy controls,
and clean separation of core models from provider-specific formats.

---

## Contents

- [0. Plan Status and Source Verification](#0-plan-status-and-source-verification)
- [1. Non-Negotiable Product Goals](#1-non-negotiable-product-goals)
- [2. Source Repository and Forking Procedure](#2-source-repository-and-forking-procedure)
- [3. Phase 0 — Repository Audit Before Coding](#3-phase-0-repository-audit-before-coding)
- [4. Core Architectural Principle](#4-core-architectural-principle)
- [5. Introduce a Provider-Neutral Domain Model](#5-introduce-a-provider-neutral-domain-model)
- [6. Schema Versioning](#6-schema-versioning)
- [7. Adapter Interface](#7-adapter-interface)
- [8. Adapter Registry](#8-adapter-registry)
- [9. Preserve Claude Code as the Reference Adapter](#9-preserve-claude-code-as-the-reference-adapter)
- [10. Codex Adapter — First Major New Provider](#10-codex-adapter-first-major-new-provider)
- [11. "Other OpenAI Agents" Design](#11-other-openai-agents-design)
- [12. Hermes Agent Adapter](#12-hermes-agent-adapter)
- [13. Source Discovery Service Refactor](#13-source-discovery-service-refactor)
- [14. Session Identity and De-Duplication](#14-session-identity-and-de-duplication)
- [15. UI Refactor](#15-ui-refactor)
- [16. Analyzer Refactor](#16-analyzer-refactor)
- [17. Provider-Specific Analysis Extensions](#17-provider-specific-analysis-extensions)
- [18. Cost and Token Metrics](#18-cost-and-token-metrics)
- [19. File and Command Security / Secret Redaction](#19-file-and-command-security-secret-redaction)
- [20. Privacy Model](#20-privacy-model)
- [21. Read-Only Contract](#21-read-only-contract)
- [22. Local Cache / Index](#22-local-cache-index)
- [23. Huge Session Handling](#23-huge-session-handling)
- [24. Corrupted and Evolving Log Formats](#24-corrupted-and-evolving-log-formats)
- [25. Runtime Schema Validation](#25-runtime-schema-validation)
- [26. Fixture Strategy](#26-fixture-strategy)
- [27. Parser Contract Tests](#27-parser-contract-tests)
- [28. Claude Regression Suite](#28-claude-regression-suite)
- [29. Codex Tests](#29-codex-tests)
- [30. Hermes Tests](#30-hermes-tests)
- [31. Integration Tests](#31-integration-tests)
- [32. Performance Tests](#32-performance-tests)
- [33. UI Capability Indicators](#33-ui-capability-indicators)
- [34. Unified Search](#34-unified-search)
- [35. Export](#35-export)
- [36. Audit-Friendly Session Report](#36-audit-friendly-session-report)
- [37. Optional OS Audit Correlation — Design Only](#37-optional-os-audit-correlation-design-only)
- [38. Configuration](#38-configuration)
- [39. Naming and Branding](#39-naming-and-branding)
- [40. Documentation Deliverables](#40-documentation-deliverables)
- [41. README Requirements](#41-readme-requirements)
- [42. CI](#42-ci)
- [43. Dependency Policy](#43-dependency-policy)
- [44. Release Gates](#44-release-gates)
- [45. Implementation Sequence](#45-implementation-sequence)
- [46. Required Implementation Discipline](#46-required-implementation-discipline)
- [47. Git Commit Strategy](#47-git-commit-strategy)
- [48. Upstream Sync Strategy](#48-upstream-sync-strategy)
- [49. Acceptance Scenarios](#49-acceptance-scenarios)
- [50. Final Deliverables](#50-final-deliverables)
- [51. Important Technical Caveats](#51-important-technical-caveats)
- [52. Definition of Done](#52-definition-of-done)
- [53. Sources to Verify During Implementation](#53-sources-to-verify-during-implementation)
- [54. Instructions to the Coding Agent](#54-instructions-to-the-coding-agent)

---

## 0. Plan Status and Source Verification

Reviewed and corrected on 2026-09-01 before execution. The facts below were checked against live systems and the GitHub API on that date rather than recalled. They are current-state observations, not
stable APIs — re-verify at implementation time.

| Claim                                        | Evidence label                | State on 2026-09-01                                                                                                 |
| -------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Upstream `yessGlory17/argus`                 | VERIFIED_PRIMARY (GitHub API) | exists; MIT; TypeScript; 113 stars; default branch `main`; last push 2026-05-08, so upstream churn risk is low      |
| Upstream `NousResearch/hermes-agent`         | VERIFIED_PRIMARY (GitHub API) | exists; MIT; last push 2026-09-01 — actively moving, so pin the commit you audit                                    |
| Codex rollout layout                         | VERIFIED_PRIMARY (local       | `~/.codex/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl`; 722 files present locally                                |
|                                              |   filesystem)                 |                                                                                                                     |
| Codex rollout record shape                   | VERIFIED_PRIMARY (local       | every line is `{type, timestamp, payload}`; observed `type` values `session_meta`, `response_item`, `event_msg`,    |
|                                              |   filesystem)                 |   `turn_context`                                                                                                    |
| Hermes canonical session store               | VERIFIED_PRIMARY (local       | `~/.hermes/sessions/<YYYYMMDD>_<HHMMSS>_<shortid>.jsonl` — NOT `~/.hermes/logs/` as the original draft assumed      |
|                                              |   filesystem)                 |                                                                                                                     |
| Hermes session record shape                  | VERIFIED_PRIMARY (local       | one JSON object per turn; observed keys `role`, `timestamp`, `model`, `platform`, `tools`, `content`, `tool_calls`, |
|                                              |   filesystem)                 |   `finish_reason`, `reasoning`, `reasoning_content`                                                                 |
| Claude fixture availability                  | VERIFIED_PRIMARY (local       | 77 project directories under `~/.claude/projects`, enough to source every fixture in section 9                      |
|                                              |   filesystem)                 |                                                                                                                     |
| Upstream test and build gates                | UNVERIFIED                    | upstream source not inspected; Milestone 1 records the real baseline                                                |
| Codex `session_index.jsonl` and state SQLite | UNVERIFIED                    | `~/.codex/archived_sessions/` exists locally; the index and SQLite surfaces were not confirmed                      |
| Hermes token or cost persistence             | UNVERIFIED                    | no usage field observed in the sampled rows; Milestone 7 decides the `tokenUsage` capability flag                   |

Four corrections were applied to the original draft. Each is marked inline as **[CORRECTION 2026-09-01]**:

1. Hermes was anchored on the wrong evidence source (section 12, section 51, section 53).
2. The reasoning-exposure rule was unimplementable as written (new section 20.1, discipline rule 11).
3. Runtime, cache and export paths were unrouted against this workspace policy (section 2, section 22, section 35, section 40).
4. The implementation sequence had no review stops and no de-scope tiers (section 45).

---

## 1. Non-Negotiable Product Goals

The finished fork must let a user open one VS Code extension and see sessions from multiple AI agents in a common model.

It must answer:

- Which agent ran?
- Which provider/client generated the session?
- Which project/workspace did it operate on?
- What user prompt initiated the work?
- What tool calls occurred?
- Which shell commands were requested?
- Which files were read, written, or edited?
- Which MCP or other external tools were called?
- What outputs/errors were returned?
- Which subagent or child task produced an action?
- What was the sequence and dependency graph?
- What were token/cost/context metrics where the source exposes them?
- What failed, retried, or looped?
- What changed over time during a live session?
- Can the same data be analyzed consistently regardless of whether it came from Claude, Codex, or Hermes?

The extension must remain **local-first** by default. No transcript, prompt, code, tool output, credentials, file content, or telemetry may be uploaded to any external service unless the user
explicitly enables such functionality in the future.

---

## 2. Source Repository and Forking Procedure

Start from:

- Upstream: `https://github.com/yessGlory17/argus`
- Current architectural premise: Argus is a VS Code extension that discovers Claude Code JSONL session transcripts, parses them, analyzes normalized steps, and renders multiple observability views.

### Required Git workflow

Do not modify the original upstream clone directly.

Perform:

```bash
# 1. Fork yessGlory17/argus into the user's GitHub account/org using GitHub UI or gh.
# 2. Clone the fork.
git clone <FORK_URL>
cd argus

# 3. Preserve upstream.
git remote add upstream https://github.com/yessGlory17/argus.git
git remote -v

# 4. Create the implementation branch.
git checkout -b feat/multi-agent-observability
```

Before changing code:

```bash
git status
git log --oneline --decorate -20
git branch -vv
```

Create an immutable baseline tag on the fork:

```bash
git tag baseline-upstream-argus
```

Do not squash away upstream history.

Preserve the upstream MIT license and attribution.

### Working location and runtime isolation

**[CORRECTION 2026-09-01]** This fork is governed under the `tools_stuff` canonical root, so it does not get cloned to an arbitrary path:

```text
/Volumes/Data/_ai/_tool/tools_stuff/argus/                 <- the fork; all implementation happens here
/Volumes/Data/_ai/_tool/tools_stuff/argus/argus-github/    <- optional read-only upstream reference clone
```

Pin the Node runtime in the fork root so the build cannot inherit whatever the host shell happens to expose:

```toml
# .mise.toml
[tools]
node = "26"
```

Run `mise install` in the fork root and confirm with `mise which node` before the baseline build. Match the major version to whatever the upstream `engines` and `@types/vscode` constraints actually
require, and record that decision in the Milestone 1 audit rather than assuming 26 is correct.

Rebuildable and ephemeral state never lives inside the repository:

| State                                        | Location                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| npm cache and build scratch                  | `/Volumes/Data/_ai/_tool/tools-working-cache/argus/`                                                         |
| logs, pid files, transient run state         | `/Volumes/Data/_ai/_tool/tools-runtime/argus/{logs,run}/`                                                    |
| extension session cache and index at runtime | VS Code `ExtensionContext.globalStorageUri` — see section 22                                                 |
| exported reports                             | user-chosen path; default under `tools-runtime/argus/exports/`, never inside the repository — see section 35 |

Fixtures are the exception: sanitized fixtures are test inputs, are committed, and live with the adapter that consumes them.

---

## 3. Phase 0 — Repository Audit Before Coding

Before implementing anything, inspect the actual current repository. Do not assume file names or internal APIs from this prompt are exact if upstream changed.

Produce:

```text
docs/architecture/current-state-audit.md
```

The audit must identify:

- extension entry points
- discovery code
- JSONL parser
- current Claude-specific types
- analyzer interfaces
- webview state model
- session list provider
- live watcher implementation
- cost/token calculation
- dependency graph implementation
- settings/configuration
- current test framework
- build/package scripts
- localization
- telemetry, if any
- storage/cache behavior
- extension IDs/commands
- current release/package flow

Specifically determine whether the repository still contains concepts equivalent to:

```text
src/
  extension.ts
  types/
  services/
    discoveryService.ts
    parserService.ts
    analyzerService.ts
  providers/
```

If names differ, map the real code to these conceptual roles.

### Baseline verification

Before modification, run all available quality gates:

```bash
npm ci || npm install
npm run lint
npm run compile
npm test
npm run build:webview
```

If a test command does not exist, document that rather than inventing success.

Package the untouched baseline if supported:

```bash
npx vsce package
```

Record exact baseline results in the audit.

**Do not start the provider refactor until current Claude behavior is understood and baseline build status is recorded.**

---

## 4. Core Architectural Principle

The central refactor is:

> Provider-specific raw records must never leak into the analyzer or UI as the primary model.

Use this layering:

```text
Raw source files / streams
        |
        v
+-----------------------+
| Agent Source Adapter  |
| Claude / Codex/Hermes |
+-----------------------+
        |
        v
Normalized Agent Model
        |
        +--> Analyzer engine
        +--> Timeline / steps
        +--> Cost/context views
        +--> Dependency graph
        +--> Search / filters
        +--> Live watcher
        +--> Export
```

Every provider implementation must conform to the same adapter interfaces.

Do **not** implement:

```text
if claude ...
else if codex ...
else if hermes ...
```

throughout the UI.

Provider branching belongs only in:

- source discovery
- raw parsing
- provider-specific normalization
- optional provider capability modules

---

## 5. Introduce a Provider-Neutral Domain Model

Create a new package/directory such as:

```text
src/core/
  models/
  schemas/
  adapters/
  registry/
  capabilities/
```

Use names appropriate to the actual codebase.

### Minimum normalized types

Define a provider identity:

```ts
export type AgentProviderId =
  | "claude-code"
  | "openai-codex"
  | "hermes"
  | (string & {});
```

Do not use a closed enum that requires rebuilding core code for every future provider.

#### Agent source descriptor

```ts
export interface AgentSourceDescriptor {
  providerId: AgentProviderId;
  clientName: string;
  clientVersion?: string;
  sourceKind:
    | "jsonl"
    | "log"
    | "sqlite"
    | "otel"
    | "api"
    | "custom";
  sourcePath?: string;
  profile?: string;
}
```

#### Agent session

```ts
export interface AgentSession {
  schemaVersion: number;

  id: string;
  providerId: AgentProviderId;
  source: AgentSourceDescriptor;

  title?: string;
  projectPath?: string;
  cwd?: string;
  workspaceName?: string;

  startedAt?: string;
  updatedAt?: string;
  endedAt?: string;

  model?: string;
  modelProvider?: string;

  parentSessionId?: string;
  rootSessionId?: string;

  events: AgentEvent[];

  metrics?: AgentSessionMetrics;
  capabilities: AgentSessionCapabilities;

  diagnostics: ParseDiagnostic[];
}
```

#### Event model

Create a discriminated union.

At minimum:

```ts
export type AgentEvent =
  | UserMessageEvent
  | AssistantMessageEvent
  | ReasoningEvent
  | ToolCallEvent
  | ToolResultEvent
  | ShellCommandEvent
  | FileReadEvent
  | FileWriteEvent
  | FileEditEvent
  | McpCallEvent
  | NetworkToolEvent
  | SubagentStartEvent
  | SubagentEndEvent
  | TokenUsageEvent
  | ContextEvent
  | CompactionEvent
  | ErrorEvent
  | SessionLifecycleEvent
  | UnknownProviderEvent;
```

All events should share:

```ts
interface BaseAgentEvent {
  id: string;
  sessionId: string;
  providerId: AgentProviderId;

  timestamp?: string;
  sequence: number;

  parentEventId?: string;
  correlationId?: string;

  rawType?: string;
  sourceOffset?: number;

  confidence?: "exact" | "derived" | "heuristic";
}
```

#### Shell command

```ts
export interface ShellCommandEvent extends BaseAgentEvent {
  kind: "shell.command";

  command: string;
  argv?: string[];
  cwd?: string;

  toolName?: string;

  exitCode?: number;
  stdout?: string;
  stderr?: string;

  durationMs?: number;

  status?:
    | "requested"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "unknown";
}
```

Do not claim stdout/stderr are available unless the source actually exposes them.

#### File operation

```ts
export interface FileOperationEvent extends BaseAgentEvent {
  kind: "file.read" | "file.write" | "file.edit";

  path: string;

  beforeHash?: string;
  afterHash?: string;

  bytesRead?: number;
  bytesWritten?: number;

  contentCaptured?: boolean;
}
```

#### MCP/tool call

```ts
export interface McpCallEvent extends BaseAgentEvent {
  kind: "mcp.call";

  server?: string;
  tool: string;

  arguments?: unknown;
  result?: unknown;

  status?: "succeeded" | "failed" | "unknown";
}
```

#### Metrics

Use capability-aware optional fields:

```ts
export interface AgentSessionMetrics {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;

  estimatedCostUsd?: number;

  contextWindowTokens?: number;
  peakContextTokens?: number;
  cacheHitRatio?: number;
}
```

Never synthesize missing provider metrics as zero.

Distinguish:

```text
undefined = source does not expose / not known
0         = source explicitly reported zero
```

---

## 6. Schema Versioning

Introduce a normalized schema version from day one.

Example:

```ts
export const NORMALIZED_SCHEMA_VERSION = 1;
```

Every normalized session must include the version.

Add a migration interface:

```ts
export interface SessionMigration {
  fromVersion: number;
  toVersion: number;
  migrate(input: unknown): unknown;
}
```

Even if only version 1 exists initially, establishing this contract prevents future provider changes from forcing destructive rewrites.

---

## 7. Adapter Interface

Create a formal source-adapter API.

For example:

```ts
export interface AgentAdapter {
  readonly id: AgentProviderId;
  readonly displayName: string;

  detect(context: AdapterDetectionContext): Promise<DetectionResult>;

  discover(
    context: SessionDiscoveryContext
  ): Promise<DiscoveredSession[]>;

  parse(
    discovered: DiscoveredSession,
    context: ParseContext
  ): Promise<AgentSession>;

  watch?(
    discovered: DiscoveredSession,
    onDelta: (delta: AgentSessionDelta) => void,
    context?: WatchContext
  ): Promise<Disposable>;

  getCapabilities(): AgentAdapterCapabilities;
}
```

#### Capabilities

```ts
export interface AgentAdapterCapabilities {
  liveWatch: boolean;
  prompts: boolean;
  assistantMessages: boolean;
  shellCommands: boolean;
  shellOutput: boolean;
  fileReads: boolean;
  fileWrites: boolean;
  fileEdits: boolean;
  mcpCalls: boolean;
  subagents: boolean;
  tokenUsage: boolean;
  cost: boolean;
  contextMetrics: boolean;
  reasoningMetadata: boolean;
}
```

The UI must use capabilities to decide what to display.

Do not show false empty states such as "0 cost" for a provider that simply does not expose cost.

---

## 8. Adapter Registry

Implement central registration:

```ts
const adapters: AgentAdapter[] = [
  claudeCodeAdapter,
  codexAdapter,
  hermesAdapter,
];
```

Prefer dependency injection or an adapter registry rather than global imports everywhere.

Provide:

```ts
registerAdapter(adapter)
getAdapter(providerId)
listAdapters()
detectAvailableAdapters()
```

This is the extension point for future agents.

---

## 9. Preserve Claude Code as the Reference Adapter

Refactor the existing Claude-specific logic into:

```text
src/adapters/claude-code/
  discovery.ts
  parser.ts
  normalizer.ts
  watcher.ts
  cost.ts
  fixtures/
  tests/
```

Exact paths may vary.

### Hard requirement: no Claude regression

Preserve all current Argus behavior, including where currently supported:

- recursive session discovery
- live JSONL watching
- prompts
- Read
- Write
- Edit
- Bash
- WebFetch
- subagent attribution
- token usage
- cost breakdown
- context-window metrics
- compaction events
- retry-loop analysis
- duplicate-read analysis
- unused-operation analysis
- flow/dependency graph
- filtering/grouping/search
- existing language support
- existing settings

The Claude adapter becomes the reference implementation against which Codex and Hermes are tested.

### Regression approach

Before refactoring, capture representative real-world Claude JSONL fixtures with all secrets and personal data sanitized.

Create fixtures covering:

1. simple prompt/response
2. Bash success
3. Bash failure
4. Read/Write/Edit
5. multiple tool calls
6. subagent
7. retry loop
8. token/cost events
9. compaction
10. malformed JSON line
11. truncated final JSON line during live write
12. very large tool output
13. Unicode paths/content
14. workspace with symlinks
15. cancelled/interrupted execution

Snapshot the current normalized behavior before changing architecture.

---

## 10. Codex Adapter — First Major New Provider

Implement:

```text
src/adapters/openai-codex/
  discovery.ts
  parser.ts
  normalizer.ts
  watcher.ts
  types.ts
  fixtures/
  tests/
```

### Validated source assumption

Current Codex local clients use rollout JSONL session records beneath the Codex home directory, commonly:

```text
$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl
```

with default home commonly:

```text
~/.codex/
```

There may also be:

```text
~/.codex/session_index.jsonl
~/.codex/archived_sessions/
```

and evolving SQLite state/index databases.

**Do not hardcode this as eternal truth.**

Detection must:

1. honor `CODEX_HOME` if set
2. use configurable paths
3. probe default known locations
4. fail gracefully if absent
5. expose source diagnostics
6. never mutate Codex files

### Discovery

Implement discovery that:

- locates active session roots
- discovers archived sessions separately
- follows date-partitioned directories
- supports incremental discovery
- avoids scanning unrelated large files
- does not recursively ingest the extension's own cache/export directory
- optionally consults index metadata only as enrichment
- uses rollout JSONL as the primary event evidence when available

#### Important safety requirement

Codex rollout files can become very large.

Do not:

```ts
readFile(path, "utf8")
```

for arbitrary large sessions.

Use streaming line parsing.

Implement:

- size limits for optional raw previews
- bounded in-memory event processing
- incremental tail offsets
- cancellation
- backpressure
- lazy loading where practical
- virtualized UI lists for huge sessions

### Codex parsing

Do not infer schema from a single sample.

Collect fixtures from multiple Codex versions and inspect raw `type`/`payload.type` combinations.

Build a parser registry similar to:

```ts
handlers = {
  session_meta: ...,
  event_msg: ...,
  response_item: ...,
  turn_context: ...,
  compacted: ...,
  token_count: ...,
}
```

Unknown records must become:

```ts
UnknownProviderEvent
```

or diagnostics; they must not crash the entire session.

### Codex event normalization

Where supported by the raw records, normalize:

- session metadata
- user messages
- assistant messages
- tool/function calls
- function/tool outputs
- shell commands
- file operations
- MCP calls
- errors
- token-count events
- context/turn metadata
- compaction
- execution durations
- working directory
- model/provider
- session lifecycle

Do not expose private chain-of-thought/reasoning content in the UI merely because some internal record exists. Preserve only reasoning metadata/summaries that are appropriate and already surfaced by
the client. Redact or omit hidden/internal reasoning payloads.

### Live Codex monitoring

Implement a watcher that:

- detects appended lines
- handles partial/incomplete final line
- resumes from last byte offset
- notices file rotation/replacement
- avoids duplicate events
- debounces UI refresh
- reconciles after missed filesystem events

### Codex identity

Represent source clearly:

```text
Provider: OpenAI Codex
Client source: CLI / VS Code / Desktop / unknown
```

Only classify the client when the transcript metadata supports it.

Do not guess.

---

## 11. "Other OpenAI Agents" Design

Do not create speculative hard-coded adapters for products whose local storage contracts are unknown.

Instead implement the provider framework so an OpenAI-family adapter can be added later.

Create documentation:

```text
docs/adapters/adding-an-agent-adapter.md
```

This guide must explain:

- source detection
- discovery
- raw event schema characterization
- normalization mapping
- capabilities
- live watching
- fixture collection
- privacy review
- tests
- UI badges
- version compatibility

If another OpenAI agent shares Codex rollout format, make it a **source/client subtype of the Codex adapter**, not copy-pasted parser code.

If its format differs, create a separate adapter.

---

## 12. Hermes Agent Adapter

Implement:

```text
src/adapters/hermes/
  discovery.ts
  parser.ts
  normalizer.ts
  watcher.ts
  profiles.ts
  fixtures/
  tests/
```

### Verified Hermes evidence sources

**[CORRECTION 2026-09-01]** The original draft anchored this adapter on `~/.hermes/logs/`. That is the wrong primary source. Checked on 2026-09-01, Hermes writes a structured per-session JSONL store,
and the formatted logs are the weaker fallback. Milestone 7 therefore starts from the store below rather than from discovery.

Primary source, VERIFIED_PRIMARY against the local filesystem on 2026-09-01:

```text
~/.hermes/sessions/<YYYYMMDD>_<HHMMSS>_<shortid>.jsonl
```

One JSON object per turn. Observed keys:

| Key                              | Notes                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `role`                           | turn role; the first line of a session carries the session header rather than a message                         |
| `timestamp`                      | per-turn timestamp                                                                                              |
| `model`                          | model id — populates `AgentSession.model`                                                                       |
| `platform`                       | client or platform id — feeds `AgentSourceDescriptor.clientName`                                                |
| `tools`                          | tool roster declared for the session; use it for capability reporting, never as evidence that a tool was called |
| `content`                        | message body                                                                                                    |
| `tool_calls`                     | structured tool invocations — the primary evidence for `ToolCallEvent`, `ShellCommandEvent` and `McpCallEvent`  |
| `finish_reason`                  | turn termination reason                                                                                         |
| `reasoning`, `reasoning_content` | model reasoning — governed by section 20.1, not rendered by default                                             |

Secondary sources present under `~/.hermes/`, worth auditing in Milestone 7 in this order:

```text
state.db, state.db-wal            # live agent state
response_store.db                 # stored responses
verification_evidence.db          # verification records
checkpoints/                      # trajectory checkpoints
logs/agent.log, logs/errors.log   # formatted logs, rotated .1 .2 .3 — FALLBACK ONLY
```

Hermes rows are OpenAI-chat-shaped. Session lifecycle boundaries, subagent attribution and dependency edges are therefore **derived**, not read. Every such normalized event carries `confidence:
"derived"` or `"heuristic"`, never `"exact"`. This is the opposite of Codex, whose `type` discriminant maps almost directly onto the normalized event union.

#### Milestone 7 audit scope

Pin the upstream commit you audit — `NousResearch/hermes-agent` was pushed to on 2026-09-01 and moves fast, so an unpinned audit describes a version that no longer exists by the time the adapter
lands. Determine:

- the exact session-header schema, and how stable it has been across recent versions
- session id derivation: filename versus an in-record field, and whether the two can disagree
- whether `tool_calls` carries results or only requests — this decides the `shellOutput` and `mcpCalls` capability flags
- whether any per-turn token usage is persisted at all — this decides `tokenUsage` and `cost`
- profile-specific roots for non-default profiles
- what `state.db` and `response_store.db` add over the JSONL, if anything, and whether reading them read-only is worth the coupling
- log rotation behaviour, but only if logs are still needed as fallback after the above

Write findings to:

```text
docs/adapters/hermes-source-audit.md
```

### Hermes profiles

Support:

```text
default profile
named profiles
```

without requiring separate extension installs.

Normalized source metadata should include:

```ts
profile?: string;
```

Discovery should locate configured Hermes home/profile roots safely.

### Hermes logs

Where logs are used:

- handle rotation (`agent.log.1`, etc.)
- correlate session IDs
- correlate components such as tools/agent/cli
- preserve timestamp/level/component
- avoid treating continuation lines as separate unrelated sessions
- never assume a human-formatted log line has a stable schema forever

If Hermes has structured JSON logging mode, prefer it.

### Hermes tool normalization

Where evidence exists, normalize:

- user requests
- assistant output
- terminal tool calls
- shell commands
- tool results
- web/research calls
- skill invocations
- subagents/delegation
- errors
- model/provider
- session lifecycle
- token/cost metrics if available

Unknown Hermes features must remain capability-gated.

---

## 13. Source Discovery Service Refactor

Replace Claude-only discovery with a multi-source discovery coordinator.

Conceptually:

```ts
class MultiAgentDiscoveryService {
  constructor(private registry: AdapterRegistry) {}

  async discoverAll(): Promise<DiscoveredSession[]> {
    // detect enabled adapters
    // discover concurrently with bounded concurrency
    // normalize discovery metadata
    // de-duplicate
    // return sortable results
  }
}
```

### Requirements

- bounded concurrency
- cancellation tokens
- progress reporting
- per-adapter timeout/error isolation
- one broken provider must not break all session discovery
- configurable scan roots
- provider enable/disable
- per-provider diagnostics

---

## 14. Session Identity and De-Duplication

Never use filename alone as a global session ID.

Create global identifiers such as:

```text
<provider-id>:<native-session-id>
```

Examples:

```text
claude-code:abc123
openai-codex:019f...
hermes:xyz789
```

If no native ID exists:

- derive a stable hash from source path + source metadata
- mark confidence as derived

Do not merge sessions across providers merely because they share a working directory.

---

## 15. UI Refactor

Keep the existing Argus usability, but make provider identity first-class.

### Session list

Every session row should show a compact provider badge:

```text
[Claude] Refactor parser
[Codex]  Audit BGP automation
[Hermes] Research deployment
```

Add filters:

- provider
- model
- project
- status
- date
- tool type
- failures
- live/finished
- archived

Add grouping:

- provider
- project
- model
- day

### Session detail header

Display:

```text
Provider
Client
Model
Session ID
Project
CWD
Start/update/end
Profile (Hermes)
Source path
Schema/parser version
Parse warnings
```

Source paths should be optionally hidden for screenshots/privacy.

### Timeline/steps

Create common icons/categories:

- user
- assistant
- shell
- read
- write
- edit
- MCP
- web/network tool
- subagent
- error
- context
- compaction
- unknown

Provider-native tool names may be displayed as secondary metadata.

### Raw view

Add an optional **Raw Source** inspector for debugging adapters.

It must:

- be disabled or collapsed by default
- clearly label potentially sensitive content
- never execute embedded content
- escape HTML
- support large-record truncation
- allow copying a sanitized representation

---

## 16. Analyzer Refactor

Existing Argus analysis rules must consume normalized events, not Claude raw types.

Migrate rules such as:

- duplicate reads
- repeated failures
- retry loops
- unused tool outputs
- wasted cost
- context pressure
- excessive file churn

Each rule must declare capabilities it requires.

Example:

```ts
requires: ["fileReads"]
```

If a Hermes session lacks reliable file-read events, the rule should be:

```text
Not applicable / insufficient telemetry
```

not:

```text
0 duplicate reads
```

---

## 17. Provider-Specific Analysis Extensions

Allow optional provider analysis modules:

```ts
interface ProviderAnalysisRule extends AnalysisRule {
  providerIds?: AgentProviderId[];
}
```

Examples:

- Claude cache-write inefficiency
- Codex compaction/runaway rollout growth
- Hermes skill/tool retry patterns

Provider-specific rules must not contaminate the normalized core model.

---

## 18. Cost and Token Metrics

Do not force one pricing model across all providers.

Separate:

```text
usage telemetry
pricing resolution
cost calculation
```

Use:

```ts
interface TokenUsage {
  input?: number;
  output?: number;
  cachedInput?: number;
  cacheWrite?: number;
}
```

and:

```ts
interface CostResolver {
  resolve(model: string, timestamp?: string): PriceSpec | undefined;
}
```

Rules:

- use source-reported cost if reliable
- otherwise calculate only when a known pricing record exists
- clearly label calculated cost as estimated
- allow pricing tables to be updated without changing parsers
- do not silently apply Claude pricing to Codex/Hermes models
- Hermes may route many model providers, so model provider and model name must be separate

---

## 19. File and Command Security / Secret Redaction

The extension is an observability product and therefore will encounter sensitive material.

Implement a redaction pipeline before display/export.

### Sensitive patterns

Support configurable detection for:

- API keys
- bearer tokens
- Authorization headers
- passwords
- private keys
- SSH keys
- AWS credentials
- GitHub tokens
- OpenAI keys
- Anthropic keys
- environment-variable secrets
- Ansible Vault password arguments
- Terraform variables that look secret
- Kubernetes tokens
- cookies
- connection strings

Do not pretend regex alone is perfect.

Provide three modes:

```text
strict
balanced
off
```

Default: **balanced**.

Raw on-disk source files remain untouched.

### Command display

Commands may contain secrets:

```bash
curl -H "Authorization: Bearer ..."
ansible-playbook --extra-vars 'password=...'
```

Redact before rendering/copy/export.

---

## 20. Privacy Model

Default policy:

```text
NO CLOUD UPLOAD
NO ANALYTICS UPLOAD
NO TRANSCRIPT UPLOAD
NO CODE UPLOAD
```

If upstream Argus contains telemetry, audit it explicitly.

Add setting:

```json
{
  "argusMultiAgent.privacy.allowExternalTelemetry": false
}
```

Prefer no external telemetry at all.

Document exactly what the extension reads.

### 20.1 Reasoning and hidden-content policy

**[CORRECTION 2026-09-01]** Discipline rule 11 in the original draft — do not expose hidden or private reasoning — is unimplementable as an absolute, because two of the three providers persist
reasoning inside the very evidence this tool exists to read. Hermes session rows carry `reasoning` and `reasoning_content`; Codex rollouts carry reasoning response items. A rule that forbids handling
what the source hands you cannot be tested, and will be quietly ignored the first time it collides with a parser.

The implementable rule separates parsing from display and export:

| Stage                              | Behaviour                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Parse                              | Reasoning IS parsed into a `ReasoningEvent`. Never silently dropped — dropping it hides parse failures and makes sequence numbering lie. |
| Cache and index                    | Never persisted as text. The cache stores presence, event count and token count only.                                                    |
| Render in UI                       | Collapsed and masked by default. Revealed only when the user explicitly enables it.                                                      |
| Export, default                    | Replaced by a placeholder recording that reasoning existed, its event count and its token count.                                         |
| Export, unredacted advanced action | Included, behind the same explicit warning that governs other unredacted content.                                                        |
| Capability flag                    | `reasoningMetadata` reports whether the PROVIDER exposes reasoning, independent of whether the user chose to show it.                    |

Add the setting:

```json
{
  "argusMultiAgent.privacy.showReasoning": false
}
```

Test it rather than asserting it: a fixture containing reasoning must round-trip to a default export with zero reasoning text present, asserted by substring search against the source text, and to an
opt-in export with the text intact.

---

## 21. Read-Only Contract

The extension must treat agent stores as read-only evidence.

It must never:

- rewrite Claude transcripts
- rewrite Codex rollouts
- modify Hermes logs
- repair provider databases in place
- truncate provider logs
- move sessions
- archive sessions
- delete source data

Any cache/index owned by the extension must live in the extension's own storage.

---

## 22. Local Cache / Index

For performance, introduce an extension-owned cache.

Do not duplicate all raw transcripts.

Store:

- source path
- source mtime
- byte offset
- file size
- normalized summary metadata
- parser version
- schema version
- hash/checkpoint
- analysis result cache

Use VS Code extension storage APIs or a clearly documented local database.

**[CORRECTION 2026-09-01]** Concretely, that means `ExtensionContext.globalStorageUri`. Never write the cache into the repository working tree, into any provider evidence directory, or into `$HOME`
directly. Reasoning text is never cached — see section 20.1.

The cache must be disposable.

Deleting the extension cache must cause a clean rebuild from original agent sources.

---

## 23. Huge Session Handling

This is critical for Codex and long agent runs.

Implement stress handling for:

```text
10 MB
100 MB
500 MB
1 GB+
```

session/log files.

Requirements:

- no full-file read into memory
- streaming JSONL parser
- line-size guard
- lazy event materialization where feasible
- virtualized UI
- cancellation
- incremental indexing
- progress indicator
- bounded raw-output retention
- truncation previews without modifying source
- searchable summaries

Test memory behavior.

Set a performance target such as:

```text
Opening a previously indexed 500 MB session should not require reading 500 MB again.
```

---

## 24. Corrupted and Evolving Log Formats

Every adapter must be resilient.

Handle:

- malformed JSON line
- truncated active line
- unknown record type
- missing timestamp
- missing session ID
- duplicate events
- out-of-order timestamps
- replaced file
- rotated file
- schema/version change
- unexpected payload shape
- non-UTF-8/invalid sequences where possible

One bad event must not invalidate the entire session.

Expose:

```text
Parse warnings: 3
Unknown event types: 2
Skipped malformed lines: 1
```

---

## 25. Runtime Schema Validation

Use a runtime schema library already present in the project if suitable; otherwise consider Zod.

Do not trust raw JSON simply because TypeScript compiles.

For each provider:

```text
raw record
  -> runtime validation
  -> provider parser
  -> normalized schema validation
```

Malformed records should generate diagnostics.

---

## 26. Fixture Strategy

Never use the user's real transcripts as committed fixtures.

Create:

```text
test/fixtures/
  claude/
  codex/
  hermes/
```

Fixtures must be:

- synthetic or heavily sanitized
- small
- deterministic
- representative
- version annotated

Each fixture should include:

```text
source-version.md
raw.*
expected.normalized.json
```

---

## 27. Parser Contract Tests

Create generic tests that every adapter must pass:

```ts
describeAdapterContract(adapter, fixtures)
```

Contract checks:

- discovery does not mutate files
- stable session ID
- stable event sequence
- malformed line handling
- unknown event handling
- capability correctness
- deterministic parse
- duplicate suppression
- timestamp normalization
- provider ID correctness
- source metadata correctness

---

## 28. Claude Regression Suite

The refactor is not complete until all original Claude behavior is proven.

Add tests covering every existing analyzer and view that depends on parsed events.

Compare old parser output to new normalized output via a compatibility mapping where appropriate.

Any intentional behavior change must be documented.

---

## 29. Codex Tests

Minimum:

1. session metadata
2. user event
3. assistant event
4. shell/function call
5. function output
6. failed tool call
7. token count
8. turn context
9. compaction
10. unknown record
11. malformed JSON
12. partial final line
13. archived session
14. large output
15. multiple sessions in one project
16. live appended events
17. `CODEX_HOME` override
18. missing default directory
19. same session discovered twice via index/path
20. huge rollout streaming benchmark

---

## 30. Hermes Tests

Minimum:

1. default profile discovery
2. named profile discovery
3. session ID correlation
4. agent activity
5. tool dispatch
6. terminal command
7. tool error
8. log rotation
9. continuation/multiline message
10. unknown log line
11. missing log directory
12. malformed timestamp
13. live append
14. multiple profiles simultaneously
15. structured session source if discovered during audit

---

## 31. Integration Tests

Create VS Code extension-level tests where practical.

Test:

- all three providers installed/present
- only Claude present
- only Codex present
- only Hermes present
- no providers present
- one malformed provider store
- live session updates from two providers concurrently
- provider filters
- grouping
- session detail loading
- analyzer capability gating
- cache invalidation
- extension reload

---

## 32. Performance Tests

Measure:

- discovery time
- parse throughput
- indexing throughput
- peak memory
- live-update latency
- UI render latency

Add benchmark scripts.

Do not make benchmarks mandatory in every local unit-test run if too slow; run them in a dedicated CI job or manual performance gate.

---

## 33. UI Capability Indicators

A user must understand why data differs by provider.

Add a telemetry/capability panel:

```text
Claude Code
✓ prompts
✓ shell output
✓ file operations
✓ subagents
✓ tokens
✓ cost

Codex
✓ prompts
✓ tool output
✓ tokens
✓ context
? cost calculation depends on model/pricing data

Hermes
✓ agent activity
✓ tools
? file operations depend on available source
? token metrics depend on provider/session source
```

Values must be generated from adapter capabilities rather than hardcoded UI marketing text.

---

## 34. Unified Search

Implement global search across normalized metadata.

Searchable:

- session title
- provider
- project
- command
- file path
- tool
- error text
- model
- session ID

Avoid indexing full sensitive file contents by default.

Make full tool-output indexing opt-in if it materially increases privacy/storage risk.

---

## 35. Export

Add local export for a selected session.

Formats:

```text
JSON — normalized machine-readable schema
Markdown — human-readable report
```

Export must use the redaction layer by default.

**[CORRECTION 2026-09-01]** Exports default to a user-chosen path outside the repository. They must never be written beneath a scanned provider directory: an export landing in `~/.claude/projects` or
`~/.codex/sessions` would be re-ingested as evidence on the next discovery pass, and would then appear as a session that never ran. Discovery must exclude the extension cache and export directories by
path, for every adapter and not only for Codex.

JSON export should include:

```json
{
  "exportSchemaVersion": 1,
  "session": {}
}
```

Provide an explicit advanced action for unredacted export with a warning.

---

## 36. Audit-Friendly Session Report

Markdown export should provide:

```text
# Session
Provider
Client
Model
Project
Session ID
Time

## User Requests

## Timeline

## Shell Commands
- timestamp
- command
- exit status
- output summary

## File Operations

## MCP / Tool Calls

## Errors

## Token / Cost Metrics

## Analysis Findings

## Parse Diagnostics
```

Do not imply it is an independent OS audit trail.

Include:

> This report reflects activity present in the agent's own local session/log sources. It is not an independent operating-system execution record.

---

## 37. Optional OS Audit Correlation — Design Only

Do **not** embed Santa or other privileged security tooling into the first implementation.

However, design an optional future correlation interface:

```ts
interface ExternalExecutionEvidenceProvider {
  findExecutions(query: {
    start?: string;
    end?: string;
    cwd?: string;
    commandHint?: string;
  }): Promise<ExternalExecutionEvidence[]>;
}
```

This would later permit correlation with:

- Santa on macOS
- auditd on Linux
- Tetragon on Linux

without mixing privileged endpoint security into provider transcript parsing.

Do not make this a Phase-1 dependency.

---

## 38. Configuration

Rename settings from Claude-only naming where needed without breaking existing users.

Example new settings:

```json
{
  "argusMultiAgent.providers.claude.enabled": true,
  "argusMultiAgent.providers.codex.enabled": true,
  "argusMultiAgent.providers.hermes.enabled": true,

  "argusMultiAgent.providers.claude.paths": [],
  "argusMultiAgent.providers.codex.paths": [],
  "argusMultiAgent.providers.hermes.paths": [],

  "argusMultiAgent.scanDepth": 5,

  "argusMultiAgent.redaction.mode": "balanced",

  "argusMultiAgent.index.toolOutputs": false
}
```

### Backward compatibility

If upstream currently exposes:

```text
argus.scanDepth
argus.language
```

either preserve them or implement a documented migration/fallback.

Do not silently reset user settings.

---

## 39. Naming and Branding

During implementation, use a neutral internal working name such as:

```text
Argus Multi-Agent
```

Do not publish under a misleading upstream identity.

Before public release:

- review Argus upstream branding/license
- clearly state it is a fork
- retain attribution
- choose an extension ID that will not collide with upstream
- do not impersonate the original publisher

---

## 40. Documentation Deliverables

Create:

```text
README.md
docs/
  architecture/
    overview.md
    normalized-event-model.md
    adapter-lifecycle.md
    privacy-security.md

  adapters/
    claude-code.md
    openai-codex.md
    hermes.md
    adding-an-agent-adapter.md
    hermes-source-audit.md

  development/
    setup.md
    testing.md
    fixtures.md
    release.md
    upstream-sync.md

  operations/
    troubleshooting.md
    large-sessions.md
    redaction.md

CHANGELOG.md
```

**[CORRECTION 2026-09-01]** These are authored under this workspace markdown policy, as the files are written rather than as a later sweep: prose hard-wrapped at 200 columns; any file over 100 lines
carrying a `## Contents` block that links its `##` headings; tables written one row per line and wrapped with the table tool, never by the prose rewrapper, whose word-count gate passes while a table
is destroyed.

---

## 41. README Requirements

README must explain, concisely:

### What it is

A local-first VS Code observability extension for AI coding/agent sessions.

### Providers

- Claude Code
- OpenAI Codex
- Hermes Agent

### What it observes

Only data present in each provider's local evidence source.

### What it is not

Not a kernel/OS audit tool.

### Privacy

All parsing local by default.

### Installation

Source build and VSIX.

### Screenshots

Provider list, unified timeline, analysis, flow graph, cost/context.

### Limitations

Provider formats evolve.

---

## 42. CI

Add CI for:

```text
lint
typecheck/compile
unit tests
adapter contract tests
webview build
extension package
```

Where feasible test on:

```text
macOS
Linux
```

Windows support can remain best-effort if upstream supports it, but do not regress existing compatibility intentionally.

Never require real Claude/Codex/Hermes credentials in CI.

---

## 43. Dependency Policy

Before adding any dependency:

- check license
- check maintenance/activity
- justify why standard library/current dependency cannot do it
- avoid telemetry-heavy dependencies
- avoid introducing cloud SaaS requirements

Keep the fork FOSS and self-contained.

---

## 44. Release Gates

Do not call the work production-ready until all mandatory gates pass.

### Gate A — Baseline preservation

- upstream baseline documented
- Claude regression fixtures pass
- existing core features function

### Gate B — Architecture

- normalized model in place
- adapter registry in place
- Claude logic isolated in Claude adapter
- analyzer/UI no longer rely on Claude raw schema

### Gate C — Codex

- Codex discovery works
- JSONL streaming parser works
- live updates work
- malformed/unknown records safe
- large rollout tests pass

### Gate D — Hermes

- actual Hermes persistence/log sources audited
- default + profile discovery works
- session correlation works
- live update works where source permits
- capability claims accurately reflect evidence

### Gate E — Security/privacy

- read-only source contract tested
- HTML escaping/XSS review complete
- secret redaction tested
- exports redacted by default
- no unapproved network upload

### Gate F — Performance

- large files do not cause catastrophic memory use
- cache/index is disposable
- indexed reopen materially faster than full reparse

### Gate G — Packaging

- VSIX builds
- clean install tested
- upgrade from original/fork baseline considered/documented
- extension reload works
- no source-store corruption

---

## 45. Implementation Sequence

Execute in this order.

**[CORRECTION 2026-09-01]** The original sequence had no stop points, which across a 54-section specification means weeks of unreviewed work before anyone sees whether the premise held. Three hard
stops are mandatory. At each, stop and report; do not proceed without an explicit go.

| Stop   | After       | Report must show                                                                                                       |
| ------ | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| Stop 1 | Milestone 1 | The real baseline: which quality gates exist, which pass, which fail, and the exact upstream commit recorded.          |
| Stop 2 | Milestone 3 | Claude parity green — every fixture in section 9 normalizes identically to the pre-refactor snapshot.                  |
| Stop 3 | Milestone 6 | Codex historical parse plus live watch working against real local rollouts, with the section 32 large-file budget met. |

Scope tiers, so the work can stop early without leaving a half-wired tree:

- **Mandatory — Milestones 1 to 6.** Claude parity plus Codex. This is a shippable product on its own.
- **Target — Milestones 7 and 8.** Hermes.
- **De-scopable — Milestones 9 to 11.** Each must be independently deferrable: if cut, the extension still builds, packages and passes its gates, with the unbuilt features absent rather than stubbed.

### Milestone 1 — Audit and baseline

Deliver:

```text
current-state-audit.md
baseline test/build report
sanitized Claude fixtures
```

No architecture changes yet.

### Milestone 2 — Provider-neutral core

Deliver:

```text
AgentSession
AgentEvent
adapter interface
adapter registry
runtime schemas
diagnostics
capabilities
```

### Milestone 3 — Claude adapter migration

Move existing Claude parsing/discovery/watch functionality behind the adapter interface.

All existing Claude behavior must work before adding Codex.

### Milestone 4 — UI provider-neutralization

Provider badges, filters, generic event renderer, capability-aware panels.

### Milestone 5 — Codex discovery + parser

Start read-only historical parsing.

Do not start live watch until deterministic fixture parsing passes.

### Milestone 6 — Codex live watch + scale hardening

Add incremental streaming and huge-file handling.

### Milestone 7 — Hermes source audit

Inspect the current Hermes code/version and identify best evidence stores.

Do not prematurely commit to parsing only `agent.log`.

### Milestone 8 — Hermes adapter

Implement best structured source plus log fallback if necessary.

### Milestone 9 — Unified analysis (de-scopable)

Port current rules to normalized events and add capability gating.

### Milestone 10 — Search/export/privacy (de-scopable)

Global search, redacted JSON/Markdown export, security review.

### Milestone 11 — CI/performance/release (de-scopable)

Complete all gates and build release candidate VSIX.

---

## 46. Required Implementation Discipline

Throughout the work:

1. **Inspect before editing.**
2. **Do not invent provider schemas.**
3. **Capture sanitized fixtures from actual current formats.**
4. **Keep providers isolated behind adapters.**
5. **Never make the UI depend directly on raw provider records.**
6. **Never mutate upstream agent evidence.**
7. **Do not claim unavailable telemetry.**
8. **Unknown events are data, not fatal errors.**
9. **Handle partial live JSONL safely.**
10. **Keep large files streaming/incremental.**
11. **Parse reasoning, then gate its display and redact it from default exports** (section 20.1).
12. **Redact secrets before display/export.**
13. **Preserve Claude functionality.**
14. **Commit in logically reversible increments.**

---

## 47. Git Commit Strategy

Use small semantic commits, for example:

```text
chore: capture upstream Argus baseline
test: add sanitized Claude parser fixtures
refactor: introduce provider-neutral session model
refactor: add agent adapter registry
refactor: migrate Claude discovery to adapter
refactor: migrate Claude parser to normalized events
feat: add provider badges and filters
feat: discover Codex rollout sessions
feat: parse Codex rollout JSONL
feat: add Codex live session watcher
perf: add incremental rollout indexing
docs: audit Hermes persistence sources
feat: add Hermes adapter
feat: capability-gate analyzer rules
feat: add redacted session export
test: add multi-provider integration suite
docs: add multi-agent architecture and release guide
```

Do not produce one giant commit.

---

## 48. Upstream Sync Strategy

Because this remains a fork of an active project:

```bash
git fetch upstream
git checkout main
git merge --ff-only upstream/main
```

If fork changes prevent fast-forwarding, use a dedicated integration branch and resolve deliberately.

Document in:

```text
docs/development/upstream-sync.md
```

which directories should remain minimally divergent.

Prefer:

```text
core extension points
```

over broad rewrites so upstream Argus improvements can be adopted.

---

## 49. Acceptance Scenarios

The release candidate must demonstrate these scenarios.

### Scenario A — Claude Code

Run Claude Code in a test repo:

```text
prompt
 -> read file
 -> edit file
 -> execute test
 -> spawn subagent if available
```

Verify the extension shows the same richness as upstream Argus.

### Scenario B — Codex

Run Codex in the same test repo:

```text
prompt
 -> inspect code
 -> edit file
 -> run tests
```

Verify:

- session automatically appears
- provider = Codex
- prompt and tool timeline reconstruct
- command/tool results correlate
- file operations display if source permits
- token/context data display if source permits
- live updates occur without manual refresh

### Scenario C — Hermes

Run Hermes:

```text
request
 -> use terminal/tool
 -> perform file/research operation
```

Verify:

- Hermes session appears
- correct profile
- correct session identity
- available tools/actions normalized
- errors correlate
- unsupported metrics display as unavailable, not zero

### Scenario D — Concurrent

Run Claude and Codex sessions concurrently in different workspaces.

No event cross-contamination.

### Scenario E — Failure isolation

Corrupt one Codex JSONL line.

Claude and Hermes discovery must still work.

Codex session must display a diagnostic rather than disappear.

### Scenario F — Large Codex session

Open a very large rollout.

Extension must remain responsive and bounded in memory.

---

## 50. Final Deliverables

At completion provide:

```text
1. Fork URL
2. Release branch
3. VSIX artifact
4. Current-state audit
5. Architecture docs
6. Claude adapter
7. Codex adapter
8. Hermes adapter
9. Normalized schema
10. Adapter SDK/guide
11. Unit + integration tests
12. Performance report
13. Security/privacy review
14. Known limitations
15. Upstream sync procedure
16. Release notes
```

Also produce:

```text
docs/release-readiness-report.md
```

with a table:

| Gate                      | Status    | Evidence |
| ------------------------- | --------- | -------- |
| Claude regression         | PASS/FAIL |          |
| Provider-neutral core     | PASS/FAIL |          |
| Codex parser              | PASS/FAIL |          |
| Codex live watch          | PASS/FAIL |          |
| Hermes adapter            | PASS/FAIL |          |
| Privacy/redaction         | PASS/FAIL |          |
| Large session performance | PASS/FAIL |          |
| VSIX packaging            | PASS/FAIL |          |

No "PASS" may be asserted without actual evidence.

---

## 51. Important Technical Caveats

### Codex

Treat local rollout JSONL as a current implementation surface, not a guaranteed eternal API.

The adapter must tolerate schema evolution.

Do not parse Codex state SQLite directly unless it adds demonstrable value that rollout JSONL cannot provide. If used, keep it read-only and optional.

### Hermes

**[CORRECTION 2026-09-01]** The richer structured store was located before implementation started: `~/.hermes/sessions/*.jsonl`, described in section 12. Treat it as canonical and `~/.hermes/logs/` as
fallback only.

Hermes upstream moves fast — it was pushed to on the day this plan was reviewed — so pin the commit you audit and treat the session-header schema as unstable across versions.

### Claude

Do not weaken the excellent Claude-specific visibility that made Argus useful merely to achieve lowest-common-denominator normalization.

The normalized model should support provider extensions/metadata.

---

## 52. Definition of Done

The project is done when:

> A user can install one local VS Code extension, automatically discover Claude Code, Codex, and Hermes sessions, inspect them through one normalized timeline and analysis framework, retain
> provider-specific richness, follow active sessions live where supported, safely handle very large or malformed evidence stores, export redacted forensic reports, and add another agent later by
> implementing one documented adapter contract rather than rewriting the application.

The design must clearly distinguish:

```text
Agent observability evidence
```

from:

```text
Independent operating-system execution evidence
```

This fork solves the first.

A future Santa/auditd/Tetragon integration may correlate the second, but it is outside the mandatory initial implementation.

---

## 53. Sources to Verify During Implementation

The coding agent must re-check current upstream documentation/source before relying on any path or schema.

Primary repositories:

- Argus: `https://github.com/yessGlory17/argus`
- OpenAI Codex: `https://github.com/openai/codex`
- Hermes Agent: `https://github.com/NousResearch/hermes-agent`

Current facts that motivated this design, but must still be verified against the installed/current version at implementation time:

- Argus currently reads Claude Code JSONL under `~/.claude/projects/` and has separated discovery/parser/analyzer concepts.
- Codex currently persists local rollout JSONL beneath `~/.codex/sessions/YYYY/MM/DD/` or `$CODEX_HOME/sessions/...`.
- Codex also currently has indexing/state surfaces that may enrich discovery, but rollout JSONL should remain the event source of truth where possible.
- Hermes persists structured per-session JSONL under `~/.hermes/sessions/` (verified 2026-09-01); `~/.hermes/logs/` is rotated formatted output and is fallback evidence only.
- Hermes also exposes `state.db`, `response_store.db`, `verification_evidence.db` and `checkpoints/`; audit these in Milestone 7 for what they add over the session JSONL, read-only.

Do not treat these implementation details as immutable public APIs.

---

## 54. Instructions to the Coding Agent

Execute the work rather than merely describing it.

At each milestone:

1. inspect current source
2. state exact files to change
3. implement
4. run relevant tests/build
5. fix failures
6. record results
7. commit
8. proceed only when the milestone gate is satisfied

Do not ask for confirmation for routine implementation decisions that are reversible and consistent with this specification.

Stop and explicitly report only if one of these occurs:

- upstream architecture has changed so substantially that the requested design is no longer applicable
- a provider no longer writes usable local evidence
- licensing creates an incompatibility
- a required feature would require exposing private chain-of-thought
- implementation would need destructive writes to provider stores
- required tests cannot be made reliable without credentials or proprietary infrastructure

Otherwise continue through the full implementation and produce the release-readiness report.
