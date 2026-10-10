---
Title: Changelog
Category: change-log
Status: current
Summary: Newest entries only; older ones rotate to docs/history (search with --find, print with --show).
Kind: log
Budget: 200 lines, 25 KB
Archive: docs/history/ (`--find`, `--show`)
Last rotated: 20261010_1822
---

# Changelog — Argus Multi-Agent Observability Fork

Durable project and governance history. Append entries; do not rewrite historical ones.

## Contents

- [20261010_1806 — governed-files standard: just stale, docs, history, history-show and rotate; records rotated](#20261010_1806--governed-files-standard-just-stale-docs-history-history-show-and-rotate-records-rotated)
- [20260902_1610 — Adapter-wide parse-outcome taxonomy](#20260902_1610--adapter-wide-parse-outcome-taxonomy)
- [20260902_1540 — M5 defect: a third Codex rollout generation](#20260902_1540--m5-defect-a-third-codex-rollout-generation)
- [20260902_1030 — Codex and Hermes wired to the webview](#20260902_1030--codex-and-hermes-wired-to-the-webview)
- [20260902_1010 — Event projection](#20260902_1010--event-projection)

## 20261010_1806 — governed-files standard: just stale, docs, history, history-show and rotate; records rotated

- justfile: `ai_it` variable and the skill-ai-it recipes `stale` (doc_freshness.py), `docs` (file_headers.py triage), `history` / `history-show` (search or print rotated entries) and `rotate` (plan by
  default, `--apply` to rotate), and `check` also runs `doc_freshness.py --check`. Workspace standard decided by the operator 2026-10-10 (skill-ai-it SKILL.md, "Governed files: headers, budgets,
  rotation and the checker's shape").
- AGENTS.md: one line on `just docs <folder>`, `just stale` and `just history <term>` / `just history-show <stamp>` (history is not read by default); 171 -> 173 lines.
- Rotation (verified no loss): CHANGELOG.md 624 -> 235 lines (16 entries to `docs/history/changelog-20261010_1802.md`; the 5 newest kept are long); SCRATCHPAD.md 198 lines, 20 KB, within budget, not
  rotated.
- scripts/check_governance.py (858 lines) split by skill-ai-it's checker splitter into `scripts/govcheck/` (entry point 54 lines; `scripts/govcheck/core.py` from the skill
  template; `scripts/govcheck/config.py`, `scripts/govcheck/helpers.py`; families paths, inventory, tasks, sync, records, archcore, all under 160 lines). Output identical before and after
  (281 checks, exit 0). Added the `structure` family (`check_govcheck_structure`, last in CHECKS) with `CHECKER_PACKAGE`, `MODULE_MAX_LINES` 400, `CHECK_MAX_LINES` 60, `OVERSIZE` empty
  (no check over 60 lines) and `CORE_TEMPLATE` in the package's config: 312 checks. doc_freshness baseline written.

## 20260902_1610 — Adapter-wide parse-outcome taxonomy

Generalized the 20260902_1540 defect from one Codex generation into a rule every adapter obeys. The important result of that incident was never "six sessions fixed" — it was a structural ambiguity
that `empty-session` collapsed:

```
the source contains nothing        !=        the parser understood nothing
```

`empty-session` was emitted by all three adapters, so all three could produce that ambiguity.

### Five outcomes, one vocabulary

Added [src/core/models/parseOutcome.ts](src/core/models/parseOutcome.ts). Every adapter now reports at most one outcome from a shared set, derived from a tally in which every record read lands in
exactly one bucket.

| Code                 | Meaning                                                                                            | Severity |
| -------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| `source-empty`       | The source holds nothing meaningful — no records, or nothing but records known to carry no content | info     |
| `parsed-empty`       | Records were read and understood, and normalization still produced no events                       | **error**    |
| `unsupported-format` | Records present, none of a structure this adapter supports. A format generation it cannot read     | **error**    |
| `malformed-source`   | The source could not be read as data at all                                                        | **error**    |
| `partial-source`     | Some records interpreted, some not. The session renders with gaps                                  | warning  |

**The invariant, stated once:** a source that held records and produced no events is an error, unless every record it held was explicitly classified as ignorable. Silence is acceptable only when the
adapter can account for every record it declined to use. A healthy parse emits no outcome diagnostic at all, because a diagnostic on every success trains readers to ignore diagnostics.

### The governing distinction for suppression

> Unknown semantic content must survive. Known structural noise may be deliberately suppressed — but suppression must be counted and diagnosed.

`718 state markers skipped` and `718 records silently vanished` describe the same bytes and are not the same claim. The first is a parser decision with evidence; the second is data loss.

### A dead check, caught by writing the test properly

The first Claude implementation compared raw records against raw records: `parser.parseFile` returns RAW records, not normalized events, so the tally read `recordsSeen: 2, eventsEmitted: 2` and the
diagnostic could not have fired under any input. It surfaced only because the test asserted the observable outcome — `parsed-empty` at `error` — rather than asserting that the code ran. Classification
now happens after normalization, where the question "records went in and no events came out" can actually be asked. Recorded because a check that cannot fail is the exact defect class this project
keeps finding, and this time it was self-inflicted.

### Validation

161 tests, up from 156. Six new outcome tests across the Claude and Codex adapters; two proven able to fail by relaxing `parsed-empty` from error to warning. Whole-store rescan: 723 Codex rollouts, 0
parse to zero events. All Claude parity snapshots unchanged; five gates pass; checks 298.

Also recorded: [ARCHITECTURE.md](ARCHITECTURE.md) gains "Source generations are unwrapped, not branched on", and the runtime render gate now marks projected-provider live watch as NOT IMPLEMENTED
rather than leaving it to fail as though it were broken.

---

## 20260902_1540 — M5 defect: a third Codex rollout generation

Six Codex rollouts parsed to zero events. The working assumption was that they were aborted sessions. They were not: every one was a complete, well-formed rollout of a rollout generation the adapter
could not read. Six of 723 in the local store, 21 to 1,546 records each, up to 1.9 MB, every line valid JSON, every file ending cleanly. All six classified UNSUPPORTED_FORMAT from raw-file evidence;
full table in [docs/runtime-render-gate.md](docs/runtime-render-gate.md).

### The defect

The envelope generations wrap each item as `{type: 'response_item', payload: {...}}`. This generation has no envelope: each line IS the item at the top level, preceded by a bare `{id, timestamp,
instructions}` header and interleaved with `{"record_type":"state"}` markers. The parser dispatches on `record.payload.type`, `undefined` on a bare record, so every record reached a `default` arm
guarded by `if (payloadType)` and was discarded without a trace.

The record kinds were all already implemented — `message`, `reasoning`, `function_call`, `function_call_output`. They were never reached. The fix is an unwrap, not new parsing.

| Defect                                                           | Fix                                                                                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| A whole rollout generation parsed to nothing                     | Unwrap a bare record and treat it as its own payload                                                                              |
| `if (payloadType)` dropped any record without a type, in silence | Removed. A record that was read and parsed exists whether or not its shape is understood; that guard defeated the unknown-event   |
|                                                                  |   mechanism for precisely the records that needed it                                                                              |

### Why this was worth chasing rather than assuming

An adapter that returns nothing and a session that contains nothing produce the same screen. The `empty-session` diagnostic said "no parseable records in rollout", which was true and useless: it
described the parser's result, not the file. Nothing in the static gates could have found this — 156 tests and 298 checks all pass on a store where six sessions were silently unreadable.

### Result

723 rollouts scanned: **0 now parse to zero events**, down from 6. The six yield 11 to 828 events each, with `tool.call` and `tool.result` matching exactly, 237/237 on the largest.

### One judgement recorded rather than assumed

`{"record_type":"state"}` is framing — 23 bytes, no payload, byte-identical, one per item, 718 in a single rollout. It is skipped, and the count reported as a `state-markers-skipped` diagnostic. This
is not the silent drop the unknown-event rule forbids: that rule protects records that are not understood, and this one is understood exactly. Emitting it would put a placeholder beside every real
event in the timeline.

### Validation

156 tests, up from 151. Five new over a SYNTHESIZED fixture — synthesized because all six real rollouts contain work against a company repository. Three of the five proven able to fail by reverting
the unwrap. All Claude parity snapshots unchanged; five gates pass; checks 298.

---

## 20260902_1030 — Codex and Hermes wired to the webview

Connected the projection to the UI through a second path, leaving Claude's path untouched.

### The dual path, and why it is not temporary sloppiness

| Provider             | Route                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Claude Code          | `DiscoveryService` and `ParserService` to `SessionDetail`, exactly as before. Unchanged    |
| OpenAI Codex, Hermes | adapter `parse()` to `AgentSession`, then `eventsToSessionDetail()`, then the same webview |

Routing Claude through a projection that had never rendered anything would put the one working provider at risk in order to make two non-working ones work. The sixteen parity snapshots are the only
thing protecting that path, and they test the parser rather than the route taken to reach it — so a mistaken re-route would not have made them red. Convergence is a later decision with its own gates:
the generic path must be proven richer-or-equal against those fixtures, with every difference classified as unchanged, an intentional fix, or a lossy regression. A lossy regression blocks it.
Architectural tidiness alone does not justify it.

### Added

| Artifact                               | Purpose                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------- |
| [src/services/providerSessionService.ts](src/services/providerSessionService.ts) | Discovers, lists and loads sessions for every provider except Claude       |
| [tests/provider-session-service.test.ts](tests/provider-session-service.test.ts) | Nine tests, written against the isolation rules rather than the happy path |
| [docs/runtime-render-gate.md](docs/runtime-render-gate.md)            | The product gate: R1 to R6, run by hand, with a result log                 |

The blast radius is two call sites. `extension.ts` merges the two session lists; `SessionWebviewProviderReact.loadSessionData` returns early for a session the new service owns, so the Claude code
below it is reached only by the provider it was written for.

### The static gates were never the product gate

Six green gates and 296 governance checks say nothing about whether a session reaches a screen. That is a structural property of static gates, not an oversight, and the new document exists so the two
claims cannot be blurred: when a provider fails to render, the static gates stay green and the product gate is marked FAIL. Its result log records failures and `NOT RUN` as first-class values, because
an absent record and a passing record must never look the same.

### Validation

151 tests pass, up from 142. The sixteen Claude parity snapshots are byte-unchanged. Two tests were proven able to fail: removing the Claude exclusion from the new service turns `never claims a Claude
session` red, and that test exists precisely because the parity snapshots would not have caught a mistaken re-route. All five gates pass; checks 296.

### Still not verified

No provider has been confirmed to display a session. The extension launches and activates; the render gate has never been run to a pass.

---

## 20260902_1010 — Event projection

Added [src/core/view/eventsToSessionDetail.ts](src/core/view/eventsToSessionDetail.ts), which projects a normalized `AgentSession` onto the Claude-shaped `SessionDetail` the webview still consumes.
Chosen over an event-native renderer because the webview is twelve tabs and roughly 4,600 lines built around `SessionDetail`: a projection makes all twelve work for every provider in one step, where a
rewrite would make one tab work for three providers and leave six tabs Claude-only until each was ported.

The projection is a bridge with a stated load limit, not the destination. Seventeen event kinds collapse into five `StepType`s, and two things survive nowhere in the target type: the per-event
`confidence` field, and the payload and provider identity of a `provider.unknown` event. Those belong to the event-native tab that follows.

### Three distinctions the projection preserves

| Distinction                            | Why it is not cosmetic                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unknown is not absent                  | Dropping a `provider.unknown` event produces the failure that event kind exists to prevent: a provider adds a record type, the adapter notices it, the      |
|                                        |   projection discards it, and the UI looks complete while under-reporting the session. Unknown events become a neutral `text` step carrying the provider's  |
|                                        |   own `rawType`                                                                                                                                             |
| unknown is not an error                | "I do not understand this record" is not "the provider failed". An `error` step would assert a failure that did not happen, and teach users to ignore red   |
| an unreported outcome is not a success | `tool.result` with no `isError` means the source did not say. `toolSuccess` stays `undefined`; coercing it to `true` invents evidence                       |

The raw payload deliberately does not reach the timeline. It is unbounded provider data and the timeline is read linearly, so one large unknown record would bury the session around it. It stays on the
event.

### Validation

Nine tests in [tests/events-to-session-detail.test.ts](tests/events-to-session-detail.test.ts), 142 passing overall. The two unknown-event tests were proven able to fail: reverting the policy to
`return null` turns both red. All five gates pass; checks 291, after `check_architecture_names_every_source_dir` correctly caught `src/core/view` before it was documented.

### Not yet wired

Nothing calls the projection. The webview provider still receives Claude-parsed `SessionDetail` directly, so Codex and Hermes remain unviewable until that call site changes. That is the next step, and
it is deliberately separate: this commit adds a pure function with tests and changes no existing behaviour.

---
