# Changelog — Argus Multi-Agent Observability Fork

Durable project and governance history. Append entries; do not rewrite historical ones.

## Contents

- [20260902_1610 — Adapter-wide parse-outcome taxonomy](#20260902_1610-adapter-wide-parse-outcome-taxonomy)
- [20260902_1540 — M5 defect: a third Codex rollout generation](#20260902_1540-m5-defect-a-third-codex-rollout-generation)
- [20260902_1030 — Codex and Hermes wired to the webview](#20260902_1030-codex-and-hermes-wired-to-the-webview)
- [20260902_1010 — Event projection](#20260902_1010-event-projection)
- [20260902_0900 — Extension Development Host](#20260902_0900-extension-development-host)
- [20260902_0030 — Coherence sweep](#20260902_0030-coherence-sweep)
- [20260901_2359 — Staleness audit](#20260901_2359-staleness-audit)
- [20260901_2330 — Milestone 8](#20260901_2330-milestone-8)
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

## 20260902_0900 — Extension Development Host

Made the interactive check runnable for the first time. Through Milestone 8 this extension had never been launched: upstream shipped no launch configuration, so every quality gate in the fork is
static and none of them proves a session renders.

### Added

| Artifact                                  | Purpose                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| [.vscode/launch.json](.vscode/launch.json)                       | F5 launches the extension in an Extension Development Host with other extensions disabled     |
| [.vscode/tasks.json](.vscode/tasks.json)                        | The pre-launch build task, bound to `just edh-build` so F5 and the terminal build identically |
| `just edh-build`                          | Compiles the extension and the webview bundle the host loads                                  |
| `just edh`                                | Launches the host from a terminal, reachable from an agent session                            |
| `just watch`                              | Incremental TypeScript rebuild                                                                |
| `check_agents_names_every_tool_dotfolder` | Asserts AGENTS.md names every agent/tool dotfolder present on disk                            |

### The `--user-data-dir` flag is load-bearing, not tidiness

The first launch attempt exited 0 and produced a window, and did nothing. With a VS Code instance already running, the `code` CLI hands its arguments to that instance, which cannot host a development
extension, so it discards `--extensionDevelopmentPath` and merely focuses a normal window. Pointing at a separate profile forces a second instance, which is the only one that can load the extension
from `out/`. Recorded because the failure is silent in both directions: the command succeeds and a window appears.

### What the run established, and what it did not

| Claim                                                    | Status                                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| The extension loads and activates in a real VS Code host | verified — `ExtensionService#_doActivateExtension argus-claude.argus-claude` in the host log, across three separate host processes        |
| No argus-side error is logged during activation          | verified — the only exception in the host log is `spawn EBADF` raised by VS Code's own built-in git extension, not by this code           |
| The Argus view renders a session                         | NOT verified. Screen capture was refused for the whole session by the capture host, and scripted keystrokes into the host window          |
|                                                          |   destabilised it. This remains open in SCRATCHPAD                                                                                        |

An extension host did exit with code 5 on the first run, twenty-two seconds after activation. It did not recur across two later runs, and the run that produced it was the run being driven by injected
keystrokes. It is recorded here as an observation, not as a finding against this code.

### Governance

Three tool dotfolders — `.ai-context/`, `.code-context-notes/`, `.remember/` — were already present and undocumented. Nothing could have reported that: every path check in
[scripts/check_governance.py](scripts/check_governance.py) verifies that a referenced path exists, and none verified that an existing surface is referenced. The new check runs in the opposite
direction and was proven able to fail before being trusted. Checks
287.

---

## 20260902_0030 — Coherence sweep

Asked one question of the whole repository: does it tell ONE story about what exists, what is done, what remains, and what is authoritative? It did not, in five places.

### Contradictions found and resolved

| #   | Contradiction                                                                | Source of truth         | Resolution                                                                            |
| --- | ---------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| 1   | `README.md` — the first file anyone opens — described a Claude-only tool.    | `ARCHITECTURE.md` and   | Fork block appended, naming all three providers and stating plainly what is NOT yet   |
|     |   Zero mentions of Codex, Hermes or multi-agent, while three adapters sat in |   the tree              |   true: only Claude is viewable, and the extension has never run in an Extension      |
|     |   `src/adapters/`                                                            |                         |   Development Host                                                                    |
| 2   | `AI_NAVIGATION.md`, the declared context entrypoint, was still the generic   | The project's own       | Project-specific routing added outside the managed block, answering the four          |
|     |   template. It routed to no adapter and to neither audit                     |   artifacts             |   questions a reader actually arrives with                                            |
| 3   | `.archcore/README.md` claimed "twenty-one documents" against 22 on disk. It  | The directory           | Corrected, and now DERIVED: `check_archcore_index_count` compares the sentence to the |
|     |   drifted the moment Milestone 7 added a superseding ADR                     |                         |   folder                                                                              |
| 4   | Residual risk lived in two places — a partial copy in `ROADMAP.md` and the   | `SCRATCHPAD.md`         | ROADMAP now carries buildable work items only and points at the register for          |
|     |   full register in `SCRATCHPAD.md`                                           |                         |   everything else                                                                     |
| 5   | Six ticked milestones were still described in future tense: M3 said watch    | `ROADMAP.md` checkboxes | Descriptions rewritten to record what happened, including the stop-gate results       |
|     |   logic "currently lives inside the webview provider", which stopped being   |                         |                                                                                       |
|     |   true when M3 moved it                                                      |                         |                                                                                       |

### Added

- `.archcore/rules/suite-is-not-governance-evidence.rule.md` — accepted. A green suite says nothing about whether the documentation is current; they are separate control planes. Written because this
  project produced direct evidence: 188 checks green while an accepted document that OUTRANKS `AGENTS.md` gave the wrong instruction.
- `check_archcore_index_count` — derives the index count from the directory rather than trusting the sentence.

### Notes

- The checker caught two of my own mistakes during this sweep, which is the point of it existing: a routing entry pointing at the rule file minutes before I wrote it, and the new rule sitting
  uncatalogued in the archcore index.
- Checks rose from 261 to 274. All six baseline gates still pass and all 16 parity snapshots hold — this was a documentation pass.

## 20260901_2359 — Staleness audit

A repo-wide audit for facts that had quietly stopped being true. The standard was "would a careful reader be misled", not "does the suite pass" — it passed throughout, at 188 checks, while eight
defects sat in the documents.

### Findings and fixes

| #   | Materiality | Defect                                                                                                                   | Fix                                                   |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| 1   | M           | `.archcore/guides/baseline-gate-procedure.guide.md`, an ACCEPTED guide at the top of the source-priority order, said the | Outcome section corrected; the old state kept under a |
|     |             |   `test` gate fails and that the failure is expected. Its "Do not" section then told the reader not to treat the         |   History heading, because a reader on an old branch  |
|     |             |   baseline as green                                                                                                      |   still needs it                                      |
| 2   | M           | `AGENTS.md` carried the same claim as live agent policy                                                                  | Corrected to state that all six gates pass and a red  |
|     |             |                                                                                                                          |   gate is a live regression                           |
| 3   | H           | `.archcore/plans/milestone-2-sequence.plan.md` said "Accepted, not started" for work completed in three commits          | Marked complete; the sequence retained as the record  |
|     |             |                                                                                                                          |   of why the order was what it was                    |
| 4   | H           | `ARCHITECTURE.md` listed four known structural obstacles, three of them resolved                                         | Open items rewritten; the resolved three moved to a   |
|     |             |                                                                                                                          |   table that records how each was fixed               |
| 5   | G           | `ROADMAP.md` still listed all three Milestone 1 blockers as open. A fix earlier in the session had SILENTLY NO-OPPED     | Rewritten by section boundary rather than by string   |
|     |             |   because it anchored on table text `table-reflow` had already padded                                                    |   match                                               |
| 6   | G           | `audit_state.py init` appended to the tracked `.gitignore`, contradicting the accepted ADR that routes generated         | `.gitignore` restored byte-exact; the entry moved to  |
|     |             |   artifacts to `.git/info/exclude`                                                                                       |   `.git/info/exclude`                                 |
| 7   | G           | The Milestone 1 audit's "Not verified" and "Effect on the remaining milestones" sections read as current state           | Dated-evidence banner added, naming what still stands |
|     |             |                                                                                                                          |   rather than dismissing the document                 |
| 8   | H           | `ARCHITECTURE.md` named NO adapter at all: `src/adapters` and all three providers, plus `src/core/adapters` and          | Components-added-by-the-fork table written; now       |
|     |             |   `src/core/models`, were absent. The component table was written at Milestone 1 against the upstream tree and never     |   enforced                                            |
|     |             |   grew. Every path IN it resolved, so path checking said nothing                                                         |                                                       |

### Checks added, all four proven able to fail

- `check_no_resolved_finding_asserted_open` — the claim-versus-claim class. Compares a document's assertion against `ROADMAP.md` as the completion surface, rather than against ground truth. Would have
  caught findings 1, 2, 3 and 5. Exempts a document that declares itself dated evidence, so history is marked rather than rewritten.
- `check_architecture_names_every_source_dir` — every directory under `src/` must be named in `ARCHITECTURE.md`. Catches finding 8 and every future recurrence.
- `check_capability_types_mirror` — `SessionCapabilities` must match field for field across the webview boundary, where it is declared twice by hand and nothing kept the two in step.
- `check_supersession_chain` — added during Milestone 7, listed here for completeness.

### Also changed, outside this repo

Three improvements to `skill-staleness-audit` itself, each caused by a real blind spot on this project: the coverage rule list gained `.tsx`, `.mjs`, `.css`, `.snap` and media (38 files, 21% of the
repo, were unclassified and the accounting reported coverage it did not have); the inverse sweep's default catalog list gained `ARCHITECTURE.md`, `CONVENTIONS.md`, `scripts/README.md` and
`.archcore/README.md`; and its skip list gained build and generator output, because cataloging a compiler's output directory is never right.

### Notes

- Checks rose from 188 to 256. Coverage reconciles: 178 files = 139 examined + 39 exempt.
- A residual-risk register was written into `SCRATCHPAD.md`, including my own errors — finding 5 was self-inflicted, and I had recorded that exact hazard as a lesson earlier the same day.
- What this audit does NOT establish: that any claim about the external world is still true. Model prices, upstream formats and vendor behaviour cannot be settled by reading the project. For those the
  audit verified the provenance label and the as-at date only.

## 20260901_2330 — Milestone 8

### Added

- `src/adapters/hermes/`: `parser.ts` reading both Hermes forms, and `HermesAdapter`.
- `scripts/make-hermes-fixtures.py` and `just hermes-fixtures`: 11 fixtures SYNTHESIZED from the observed schema rather than harvested, plus a `--verify-schema` mode that re-derives the shape from the
  live store and fails on drift.
- `tests/hermes-adapter.test.ts`: 21 tests over detection, dual-form discovery, snapshot and mirror parsing, confidence marking and capability reporting.
- The Hermes adapter is registered at activation. All three providers are now behind the contract.

### Changed

- `justfile`: the `test` recipe comment was stale, still claiming the gate would fail until M2 added a harness.

### Notes

- **Hermes fixtures are synthesized, not harvested, and that is a deliberate departure.** Claude and Codex fixtures are sanitized copies of the operator's own coding transcripts, where redacting
  credentials and paths makes them publishable. Hermes sessions are personal conversations over Telegram and Discord plus a 14 KB system prompt, and removing secrets from a personal chat leaves a
  personal chat. The generator reads the live store only to derive the shape; `--verify-schema` proves the fixtures still match it.
- The schema check earned its place immediately: it failed the first run because the fixture tool vocabulary held 11 names against 37 in the live store, including a second shell tool, `bash`, that the
  audit's top-14 had not surfaced.
- **Confidence is lower here than for the other two providers, deliberately.** A Hermes record says a function named `terminal` was called; that it is a shell execution is our inference, so the
  command is `derived` while the result carrying the exit code is `exact`. A `delegate_task` call becomes a `subagent.start` marked `heuristic` — the weakest marker in the vocabulary — because Hermes
  records the delegation and nothing else.
- The continuation-line rejoin needed a correction the test caught: concatenating the physical lines back with a real newline reproduces the same invalid JSON, because JSON forbids a raw newline
  inside a string. The rejoin escapes it.
- Tests: 131. Checks: 186. All six gates pass.

## 20260901_2245 — Milestone 7

### Added

- [docs/adapters/hermes-source-audit.md](docs/adapters/hermes-source-audit.md): the Milestone 7 audit, against pinned upstream `5a8e8a6b` (2026-09-01) and the installed checkout `68d081f5`
  (2026-05-10).
- `.archcore/adr/hermes-snapshot-is-primary.adr.md`, superseding `.archcore/adr/hermes-evidence-source.adr.md`.
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
