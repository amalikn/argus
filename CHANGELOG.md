# Changelog — Argus Multi-Agent Observability Fork

Durable project and governance history. Append entries; do not rewrite historical ones.

## Contents

- [20260901_2245 — Milestone 7](#20260901_2245-milestone-7)
- [20260901_2200 — Milestone 6, Stop 3](#20260901_2200-milestone-6-stop-3)
- [20260901_2130 — Milestone 5](#20260901_2130-milestone-5)
- [20260901_2045 — Milestone 4](#20260901_2045-milestone-4)
- [20260901_2015 — Milestone 3, Stop 2](#20260901_2015-milestone-3-stop-2)
- [20260901_1950 — Milestone 2.5](#20260901_1950-milestone-25)
- [20260901_1935 — Milestone 2.4](#20260901_1935-milestone-24)
- [20260901_1915 — Milestone 2.1 to 2.3](#20260901_1915-milestone-21-to-23)
- [20260901_1845](#20260901_1845)
- [20260901_1830](#20260901_1830)
- [20260901_1800](#20260901_1800)
- [20260901_1745](#20260901_1745)
- [20260901_1708](#20260901_1708)

---

## 20260901_2245 — Milestone 7

### Added

- [docs/adapters/hermes-source-audit.md](docs/adapters/hermes-source-audit.md): the Milestone 7 audit, against pinned upstream `5a8e8a6b` (2026-09-01) and the installed checkout `68d081f5`
  (2026-05-10).
- `.archcore/adr/hermes-snapshot-is-primary.adr.md`, superseding `hermes-evidence-source.adr.md`.
- `check_supersession_chain` in the governance checker: a superseded document must name its replacement and the replacement must name it back.

### Changed

- `.archcore/adr/hermes-evidence-source.adr.md` marked `status: superseded` with a `superseded_by` pointer and a banner. Not edited in place beyond that, per the acceptance rules.

### Notes — audit findings

- **The accepted ADR was incomplete.** `~/.hermes/sessions/` holds two formats from two writers: 60 `*.jsonl` (18.2 MB, 4,601 rows) and 243 `session_*.json` (119.9 MB, 33,668 messages). All 60 JSONL
  stems appear as `session_id` values in the JSON store, so the snapshot store is a strict superset. Primary source is now the JSON snapshot.
- **The filename is not the id.** 76 of 243 filenames disagree with the `session_id` inside the file. Keying on the filename would have mis-identified nearly a third of the store.
- **No token usage exists anywhere in either format.** Zero hits across every usage-shaped key. So `tokenUsage`, `contextMetrics` and `cost` are all false for Hermes, not because the model is
  unpriceable — `deepseek-v4-flash` is in the vendored table — but because there is nothing to multiply.
- **Shell exit codes are recorded** (684 occurrences), so Hermes `shell.command` status is `exact`, like Codex and unlike Claude.
- **Five malformed lines are a third failure mode**: unescaped newlines inside a `browser_navigate` result split one logical record across physical lines. Claude had zero undecodable lines in
  1,018,178; this hazard would never have been found by generalizing.
- **The databases add nothing.** `state.db` is 501 MB of live gateway runtime state with nearly every table empty and is actively written; `response_store.db` is empty; `verification_evidence.db` has
  46 state rows and zero events. The session files are the only meaningful source, which removes the SQLite work from Milestone 8.
- The installed build is four months behind the pinned upstream HEAD, and the local evidence was written by that older build. Recorded as the audit's principal caveat.
- The new supersession check caught a real defect on its first run: the `superseded_by` pointer had silently failed to land because the edit anchored on a tags value that canonicalization had already
  rewritten. Fixed the document, not the check.
- Checks: 179 then 181.

## 20260901_2200 — Milestone 6, Stop 3

### Added

- Incremental parsing for Codex: `parseRolloutIncremental` resumes from a byte offset and returns the offset of the last COMPLETE line, plus a sequence to continue from.
- `CodexAdapter.watch`: live rollout following that reads only appended bytes.
- `tests/codex-scale.test.ts`: the scale gate, the incremental-read assertion, the partial-line correctness case and a live-watch lifecycle test.

### Changed

- `ClaudeWatcher` renamed to `SessionFileWatcher` and moved to `src/core/watch/`. It was written for Claude, and the moment Codex needed the same debouncing and size deduplication it moved to shared
  code rather than being copied.

### Notes — Stop 3 report

- **Scale measured, not asserted.** A synthesized 15 MB rollout of 20,000 records parses in **381 ms**, streamed. Extrapolated, the largest rollout in the local store, 45 MB, is roughly one second. An
  incremental pass over an appended record takes **4 ms**.
- The offset only ever advances past complete lines. A rollout read mid-write ends on a partial record, and advancing past it would drop that record permanently once the rest landed. There is a test
  that writes half a record, reads, completes the record, resumes from the recorded offset, and asserts the whole record arrives.
- An overlapping tick is dropped rather than queued: the next change fires again, and two concurrent parses of the same growing file would double-count events.
- Tests: 110. All six gates pass.

## 20260901_2130 — Milestone 5

### Added

- `scripts/make-codex-fixtures.py` and `just codex-fixtures`: nine sanitized Codex rollout fixtures harvested from real sessions by predicate, plus two synthesized failure modes.
- `src/adapters/openai-codex/`: `types.ts`, a streaming `parser.ts`, and `CodexAdapter` implementing the adapter contract.
- `tests/codex-adapter.test.ts`: 21 tests over detection, date-partition discovery, parsing, capability derivation and both format generations.
- The Codex adapter is registered at activation.

### Notes

- **Codex writes two different rollout formats, and both exist in a real store.** Builds up to roughly 2026-06 emit `exec_command_end`, `patch_apply_end` and bare message payloads; builds from 2026-08
  wrap everything in `event_msg/item_completed` with a typed `item`. This was found by parsing the local store, not from any changelog, and an adapter reading only one generation would have shown
  empty sessions for half the machine. The parser reads both.
- The newer generation records more than the older one: `ContextCompaction`, `SubAgentActivity` and `CollabAgentToolCall`, so Codex does have subagents where the older format showed none.
- Codex records shell exit codes, so `shell.command` events are marked `exact` here where the Claude adapter marks the same field `derived`. That difference is exactly what the confidence marker
  exists to express.
- Capabilities are derived from what each session actually contained, not from what Codex can do in principle.
- Discovery walks `YYYY/MM/DD` partitions rather than recursing, because the Codex home also holds caches, attachments and archived sessions that must not be ingested as evidence.
- Tests: 106. All six gates pass.

## 20260901_2045 — Milestone 4

### Added

- `SessionCapabilities` on both sides of the webview boundary, plus `providerId` and `providerName` on `SessionSummary` and `SessionDetail`.
- `FilterState.selectedProviders` and a toggling provider filter, wired through the list webview.
- Provider badges: in the session detail header, and on list rows but only when the list actually spans more than one provider.
- `tests/ui-neutrality.test.ts`.

### Changed

- The Cost and Context tabs are rendered from capability flags rather than unconditionally. A session whose model is missing from the pricing table now has no Cost tab instead of a tab full of zeros.
- `NO_CAPABILITIES` is the webview fallback for a session that arrives without a capabilities block, so an older cached session hides panels rather than rendering empty ones.

### Notes

- The cost capability is decided per session, not per provider: Claude reports usage, but a model absent from the pricing table cannot be costed.
- **Deferred deliberately: the generic event renderer.** The webview still consumes `SessionDetail` and `Step` rather than `AgentEvent`. Rewriting the renderer against the normalized model while only
  one provider exists would be designing against a single example — the same mistake the plan corrections removed elsewhere. It lands in Milestone 5 and 6, once Codex is a second real shape to design
  against.
- Tests: 85. All six gates pass.

## 20260901_2015 — Milestone 3, Stop 2

### Added

- `src/adapters/claude-code/`: `normalizer.ts`, `watcher.ts` and the `ClaudeCodeAdapter` implementing the adapter contract.
- `tests/claude-adapter.test.ts`: 14 tests over detection, discovery, parsing into the normalized model, confidence marking, diagnostics and live watch.

### Changed

- `src/providers/sessionWebviewProviderReact.ts`: the two raw `fs.watch` calls are gone. Watching, debouncing, size deduplication and the lazy `subagents/` mount now live in `ClaudeWatcher`. Finding
  F4 is closed; the provider decides what to do on a change and owns no filesystem handles.
- `src/extension.ts`: registers the Claude adapter at activation.
- `AgentProviderId` spelled with `string & Record<never, never>` rather than `string & {}`, which the lint rule bans. The open union is pinned by a test, so closing it would fail rather than pass
  quietly.

### Notes — Stop 2 report

- **Claude parity holds.** All 16 parity snapshots are unchanged. The adapter delegates to the existing `ParserService` rather than reimplementing it, so the parse is byte for byte what it was and any
  snapshot movement would have been a mapping bug and nothing else.
- Two real mapping defects were caught by the new tests rather than by inspection: token usage is attached to assistant message steps, not only to tool calls, so the early returns for text, reasoning
  and error steps dropped every usage event in a conversation-only session; and the watch test exposed that `fs.watch` registration is not effective instantly on macOS.
- All six baseline gates pass. Tests: 81. Checks: 169.

## 20260901_1950 — Milestone 2.5

### Added

- `src/core/models/schema.ts`: `NORMALIZED_SCHEMA_VERSION`, `SessionMigration`, and a composing `migrateSession` that refuses a session from a newer version rather than passing it through.
- `src/core/models/agentEvent.ts`: the `AgentEvent` discriminated union over 17 kinds, `Confidence`, an open `AgentProviderId`, and a namespaced `extensions` field so provider data never widens a
  normalized type.
- `src/core/models/agentSession.ts`: `AgentSession`, `AgentSourceDescriptor`, `AgentSessionCapabilities`, `AgentSessionMetrics`, `ParseDiagnostic`, `AgentSessionDelta`, plus `NO_CAPABILITIES` and
  `emptySession`.
- `src/core/adapters/agentAdapter.ts`: the adapter contract — `detect`, `discover`, `parse`, optional `watch`, `getCapabilities` — with its context types.
- `src/core/adapters/registry.ts`: `AdapterRegistry`, which refuses duplicate registration and isolates a throwing adapter during detection.
- `tests/core-model.test.ts`: 12 tests over the model, migrations and registry.

### Notes

- Every capability starts `false`, so an adapter has to prove what it supports rather than inherit optimism.
- `diagnostics` is always present even when empty, because an absent array and a clean parse are different claims.
- No existing code path uses any of this yet. Milestone 3 moves the Claude implementation behind it.
- Tests: 66 passing.

## 20260901_1935 — Milestone 2.4

### Added

- `src/core/pricing/pricingProvider.ts` and `tests/pricing.test.ts`: one pricing resolution path for every provider, reading the vendored table. An unknown model returns `undefined` rather than
  another model rates.

### Changed

- `src/types/models.ts`: the hardcoded `MODEL_PRICES` table, `getModelPricing` and `calculateCost` deleted. `Step.cost` and `SessionDetail.cost` are now optional, so unknown is representable.
- `src/services/parserService.ts`: the second, private, disagreeing copy of `calculateCost` deleted; cost delegates to the provider, and an uncostable step leaves the session total unchanged instead
  of adding a guess.
- `src/services/analyzerService.ts`: six cost accumulation sites reconciled with optional cost. A step with no attributable cost contributes nothing to a waste total, which is not the same claim as it
  being free.
- 11 parity snapshots updated deliberately. Only `totalCost` moved; step counts, tool sequences and findings are byte-identical.

### Notes

- The snapshot movement was verified by hand before acceptance, not accepted because it was expected. The token-cost fixture recomputes to 0.12617925 against a recorded 0.04546425, and the
  hand-computed figure matches the new snapshot exactly.
- Root cause of the increase: upstream charged cache creation at 0.25 times the input rate where the published Anthropic rate is 1.25 times input, understating cache writes fivefold. This is a second,
  independent F5 defect, pointing the opposite way to the `claude-opus-4-6` overstatement. Recorded in the audit.
- Tests: 54 passing. Checks: 166. All six baseline gates pass.

## 20260901_1915 — Milestone 2.1 to 2.3

### Added

- Test harness: vitest 3, `vitest.config.ts`, `npm test` now runs it. Finding F1 is closed and all six baseline gates pass for the first time.
- `scripts/make-fixtures.py` and `just fixtures` / `just fixtures-verify`: harvests the Claude fixture corpus from real transcripts, sanitizes it, synthesizes the three failure modes, and verifies no
  secret survived.
- `tests/fixtures/claude/`: 16 files across 15 categories. Category 06 is a directory layout, because Claude stores a subagent as a sibling `subagents/` directory rather than inline records.
- `tests/fixtures.test.ts`: pins each fixture to the property its name claims, plus a leak assertion that runs on every test invocation rather than only on rebuild.
- `tests/claude-parity.test.ts` and its snapshots: the Stop 2 gate. Captures what the pre-refactor Claude pipeline produces for every fixture.
- `scripts/README.md` inventory table with safety labels for all five scripts.

### Changed

- `package.json`: `test` was a dead script pointing at a path that never existed; it now runs vitest. `test:watch` and `test:coverage` added.

### Notes

- Three real defects were found and fixed while building the corpus, each caught by a check rather than by inspection: fixtures were written with pretty-print separators while real transcripts are
  compact; a rewrite of the builder silently dropped the `redact()` call and produced structurally perfect fixtures carrying the operator home path; and windowing on an anchor broke the `parentUuid`
  chains, so a 110 KB fixture parsed to a single step and would have pinned damaged behaviour as the parity baseline.
- Checks rose from 157 to 166. Tests: 43 passing, 16 snapshots.

## 20260901_1845

### Changed

- All 21 Archcore documents moved from `status: proposed` to `status: accepted`, each gaining an `accepted: 20260901` field beside its `date:`.
- `.archcore/README.md`: status-of-the-set section rewritten to record the acceptance and what it means — the set now outranks `AGENTS.md`, the narrative documents and `SCRATCHPAD.md` in the
  source-priority order, and superseding a document means writing a replacement that names it rather than editing it in place.

### Added

- `check_archcore_frontmatter` in `scripts/check_governance.py`: every Archcore document must declare a lifecycle state from a closed set, carry a `source:` provenance header, and record an
  `accepted:` date when accepted.

### Notes

- Checks rose from 136 to 157. The new check was proven able to fail by stripping an `accepted:` date and watching it go red before restoring it.
- The accepted set carries real authority now. An agent reading a conflict between `AGENTS.md` and an Archcore document must follow the Archcore document.

## 20260901_1830

### Added

- `.archcore/` populated by an authorized promote run: 6 adr, 7 rules, 4 specs, 2 guides, 2 plans, all `status: proposed` with `source:` provenance headers.
- `.archcore/README.md` as the durable index, carrying the deliberately-never-promoted table out of the candidates queue before it was deleted.
- Orphan coverage in `scripts/check_governance.py`: every promoted Archcore document must be linked from the index, in both directions.

### Changed

- Documents renamed to the Archcore filename convention `<slug>.<type>.md` after `archcore status` rejected the numbered form. Tags canonicalized from 40 singletons to 14 shared terms.
- `context-map.yaml`: three read-routing entries to the deleted candidates queue removed. The `candidates_report:` workflow key stays, because it names the artifact a future refresh would produce.
- `repomix.config.json`: candidates entry removed, since the file no longer exists.
- `SCRATCHPAD.md`: the open item and next action that pointed at the candidates queue now point at reviewing the promoted set.

### Removed

- `ARCHCORE_PROMOTION_CANDIDATES.md` — a proposal queue, deleted by promote so it cannot become a stale second index.

### Notes

- Generated by `skill-ai-it` in `promote` mode. Checks rose from 87 to 135; the new orphan check was proven able to fail before being trusted.
- One unresolved conflict: `archcore status` requires every markdown file under `.archcore/` to match `<slug>.<type>.md`, which `.archcore/README.md` cannot satisfy while also being the index the
  skill mandates. Reported rather than silently resolved.

## 20260901_1800

### Added

- Full governance scaffold completed: `CHANGELOG.md`, `SCRATCHPAD.md`, `ARCHITECTURE.md`, `CONVENTIONS.md`, `ROADMAP.md`, `ARCHCORE_PROMOTION_CANDIDATES.md`.

### Changed

- `scripts/check_governance.py` registries updated: `CHANGELOG.md` and `SCRATCHPAD.md` restored as governance surfaces; `ARCHITECTURE.md` and `ROADMAP.md` removed from conditional paths now that they
  exist.
- `repomix.config.json` includes the promotion candidates report while it exists.

### Notes

- Generated by `skill-ai-it` in `bootstrap` mode, second pass. The first pass deliberately omitted the inferred-prose documents; the operator subsequently authorized them.
- No `.archcore/` content files were written. Promotion candidates are reported only, per the report-first rule.

## 20260901_1745

### Added

- Governance scaffold: `AGENTS.md`, `CLAUDE.md`, `AI_NAVIGATION.md`, `context-map.yaml`, `scripts/README.md`, `scripts/check_governance.py`, `repomix.config.json`, `.archcore/` initialization.

### Changed

- `justfile` gained a `check` recipe wiring the governance checker, and a `_require-venv` guard.
- `README.md` trimmed: shields badge row, bug and feature call-to-action row, star request, and section link row removed. Content untouched.

### Notes

- Generated artifacts from graphify and repomix are excluded via `.git/info/exclude` rather than `.gitignore`, keeping the upstream-sync merge surface small.

## 20260901_1708

### Added

- Milestone 1 baseline: `.mise.toml`, `justfile`, `scripts/baseline-gates.sh`, `scripts/fixture-scan.py`, `scripts/refresh-pricing.mjs`, `src/pricing/model-pricing.json`,
  `docs/architecture/current-state-audit.md`, `docs/argus-multi-agent-implementation-plan-20260901_1708.md`.

### Notes

- Fork established from `yessGlory17/argus` at `3bfbd8b`, tagged `baseline-upstream-argus`. No upstream source file was modified.
- Baseline gates measured rather than assumed: install, lint, compile, build:webview and package pass; `npm test` fails because the declared test path has never existed.
