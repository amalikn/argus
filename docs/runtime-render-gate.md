Title: Runtime Render Gate
Category: quality-gate
Status: current
Authority: local-supplement
Scope: Interactive verification that the extension renders sessions from every wired provider
Last reviewed: 2026-09-02
Summary: The product gate that the six static gates cannot express. Static gates prove the code compiles, lints, types and passes its unit suite; none of them proves a single pixel reaches a user.
  This gate is run by hand in an Extension Development Host and recorded as evidence.

# Runtime Render Gate

## Contents

- [Why this exists separately](#why-this-exists-separately)
- [How to run it](#how-to-run-it)
- [R1 — Extension activation](#r1-extension-activation)
- [R2 — Claude regression](#r2-claude-regression)
- [R3 — Codex rendering](#r3-codex-rendering)
- [R4 — Hermes rendering](#r4-hermes-rendering)
- [R5 — Cross-provider isolation](#r5-cross-provider-isolation)
- [R6 — Recording the result](#r6-recording-the-result)
- [Result log](#result-log)

---

## Why this exists separately

Through Milestone 8 this project accumulated six green gates and 292 governance checks while never once displaying a session to a human. That is not an oversight to apologise for; it is a structural
property of static gates, and it is worth stating plainly so nobody mistakes a green suite for a working product.

**A static gate and a product gate are different claims, and they must never be blurred.** When a provider fails to render, the static gates stay green — correctly, because the code still compiles and
its units still pass — and this gate is marked FAIL. A report that says "all gates pass" while nothing renders is the precise failure this document exists to prevent.

The gate is manual by necessity. Automating it needs `@vscode/test-electron`, which is Milestone 11 work; until then a recorded human pass is better evidence than an unrun automated one.

## How to run it

```
just edh
```

That builds the extension and the webview bundle, then launches a second VS Code instance with the extension loaded from `out/` and all other extensions disabled. `F5` inside VS Code does the same
thing.

Work down R1 to R5 in order. R1 gates everything: if the view does not open, the rest is unreachable. Record the outcome in the [result log](#result-log) with a date and the commit tested, whether it
passed or failed. **A failed run is recorded, not deleted** — an absent record and a passing record must never look the same.

## R1 — Extension activation

- [ ] Extension Development Host launches
- [ ] The Argus icon appears in the activity bar
- [ ] Clicking it opens the Sessions view
- [ ] The session list populates
- [ ] No exception in the extension host log
- [ ] No exception in the webview developer console

## R2 — Claude regression

Claude keeps its original path deliberately, so this section is a regression check rather than a feature check. Open one representative session, and one known to contain a subagent.

- [ ] Session list shows Claude sessions
- [ ] A session opens
- [ ] Prompt and message content render
- [ ] Tool steps render, with their results
- [ ] File operations render
- [ ] A subagent session still interleaves correctly
- [ ] Cost tab behaves as before, allowing for the deliberate `PricingProvider` corrections in finding F5
- [ ] Context tab behaves as before
- [ ] A live append updates the open session without reopening it

## R3 — Codex rendering

Use a real rollout containing several event types. Codex reaches the webview through [eventsToSessionDetail](../src/core/view/eventsToSessionDetail.ts), so this section tests the projection as much as
the UI.

- [ ] The Codex provider badge is visible in the list
- [ ] A session opens without exception
- [ ] User and assistant events render
- [ ] Tool call and tool result render, paired
- [ ] Shell commands render where the rollout contains them
- [ ] Token and context data appear ONLY where the source reported them
- [ ] An unrecognized rollout record renders neutrally, carrying its `rawType`, neither dropped nor coloured as an error
- [ ] The Cost view does not show an empty or zero state merely because pricing is unavailable — the capability flag should hide it
- [ ] A live append appears without reopening the session — **NOT IMPLEMENTED** as of `3ee0c4c`. The adapters expose `watch()`, but `ProviderSessionService` does not call it, so a projected provider does not update in place. Record as NOT IMPLEMENTED, not FAIL: it is absent work, not broken work

## R4 — Hermes rendering

Use a synthesized fixture, never a real session: Hermes sessions are personal Telegram and Discord conversations, and redacting a personal chat leaves a personal chat. See
[CONVENTIONS.md](../CONVENTIONS.md).

- [ ] The Hermes provider badge is visible
- [ ] A session opens without exception
- [ ] User and assistant turns render
- [ ] Tool calls and results render
- [ ] Derived and heuristic facts are not presented as though they were exact — the normalized model marks them, and the UI must not quietly promote them
- [ ] Absent token usage renders as absent, never as zero
- [ ] An unrecognized Hermes shape renders neutrally

## R5 — Cross-provider isolation

Open Claude, then Codex, then Hermes, then Claude again.

- [ ] No events from a previous provider remain visible
- [ ] Capability-gated tabs update between providers
- [ ] Model, cost and context metadata do not leak between sessions
- [ ] Provider-specific state clears on navigation
- [ ] Concurrent live watchers do not cross-update sessions — **NOT IMPLEMENTED** for projected providers, same reason as R3

## R6 — Recording the result

Record the run in the result log below, in this shape:

```
RUNTIME_RENDER_GATE: PASS | FAIL
commit:  <sha>
date:    <YYYYMMDD_hhmm>

Claude:                    PASS | FAIL | NOT RUN
Codex:                     PASS | FAIL | NOT RUN
Hermes:                    PASS | FAIL | NOT RUN
Cross-provider isolation:  PASS | FAIL | NOT RUN
Extension host errors:     <count>
Webview errors:            <count>
```

`NOT RUN` is a legitimate value and is not the same as `PASS`. A provider that could not be exercised — no sessions on the machine, no fixture to hand — is recorded as such rather than assumed good.

## Result log

<!-- count:asat -->

### 20260902_1030 — commit `3ee0c4c` — R1 INCOMPLETE

```
R1 — Extension activation

Argus activity view opens:      NOT RUN
Session list populates:         NOT RUN
Codex sessions present:         NOT RUN
Codex provider badge present:   NOT RUN
Extension Host errors:          0
Webview console errors:         0

Overall R1: NOT RUN
```

`NOT RUN`, not `FAIL`. Nothing about the extension prevented the check; the operator harness could not drive the click. Recording it as a failure would assert a defect that no evidence supports.

**What WAS established, from a window capture of the host:**

| Observation                              | Evidence                                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| The extension activates                  | `ExtensionService#_doActivateExtension argus-claude.argus-claude` in the host log, across several host processes |
| The Argus view container is contributed  | A sixth icon is present in the activity bar of the Extension Development Host                                    |
| The Argus status-bar item is contributed | "Argus" is rendered at the right of the status bar                                                               |
| No errors or warnings                    | The status bar problem counters read `0` and `0`                                                                 |

**Why the click could not be driven.** Screen capture through the accessibility harness was refused for the session; its focus action is refused as foreground execution; and a raw coordinate click
cannot be aimed, because the development host and the operator's own editor are both processes named `Code`, so raising one by pid does not reliably put it under the cursor. Two clicks landed in the
operator's own window before this was understood. Neither modified a file — the working tree stayed clean — but the approach was wrong and was abandoned rather than retried.

### 20260902_1030 — commit `3ee0c4c` — data-path probe (NOT a render proof)

The list and projection were exercised headlessly against the real local stores, through the same code the UI calls. This proves what the list *would* contain and what the projection *would* produce.
It proves nothing about pixels, and does not substitute for R1 to R5.

| Probe                                      | Result                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Sessions the new service would list        | 722 Codex, 167 Hermes                                                                                                     |
| Claude sessions claimed by the new service | none — the isolation rule holds against the real store, not only against a fake adapter                                   |
| Provider labels                            | "Codex" and "Hermes", taken from each adapter                                                                             |
| Codex richest of 40 sampled                | 1,639 steps — 753 text, 454 thinking, 432 tool calls — model `gpt-5-codex`, cost $84.58, 496 steps carrying usage         |
| Hermes richest of 40 sampled               | 1,022 steps — 202 text, 408 thinking, 412 tool calls — 14 files read, 22 written, tools including `Bash`, `Read`, `Write` |
| Hermes cost and usage                      | `0` and no step carrying usage, which is what the source audit predicted and the capability flags declare                 |
| Codex sessions parsing to zero steps       | 6 of 40 sampled, each with an `empty-session` diagnostic                                                                  |

Two things in that table are worth reading twice. Hermes reporting no usage anywhere is a *confirmation* rather than a gap — the audit found none in the store, the adapter declares `tokenUsage` false,
and the projection did not invent any. And Codex showing zero files read or written is expected rather than broken: Codex performs file work through its `shell` tool, so there are no typed file events
to collect.

**Open question, not yet a finding.** Six of forty sampled Codex rollouts parse to no records at all. That is plausibly correct — an aborted session leaves an empty rollout — but it has not been
confirmed against the files, and an adapter silently returning nothing looks identical to a session that genuinely contains nothing. Worth one look before the render gate is run.

### 20260902_1540 — the six empty Codex rollouts, classified

All six were classified from raw-file evidence. **None was empty.** The open question resolved into an M5 defect.

| File          | Size     | Records | JSON parses | Ends clean | `session_meta` | `response_item` | Classification     |
| ------------- | -------- | ------- | ----------- | ---------- | -------------- | --------------- | ------------------ |
| `...4649c3ac` | 1,055 KB | 774     | all         | yes        | no             | no              | UNSUPPORTED_FORMAT |
| `...8e7b127b` | 290 KB   | 166     | all         | yes        | no             | no              | UNSUPPORTED_FORMAT |
| `...0543a78d` | 31 KB    | 21      | all         | yes        | no             | no              | UNSUPPORTED_FORMAT |
| `...b8af4091` | 1,885 KB | 1,546   | all         | yes        | no             | no              | UNSUPPORTED_FORMAT |
| `...46991cc4` | 39 KB    | 46      | all         | yes        | no             | no              | UNSUPPORTED_FORMAT |
| `...e3b767cc` | 112 KB   | 77      | all         | yes        | no             | no              | UNSUPPORTED_FORMAT |

Every file was complete and well formed. Their first three record types were `id+timestamp+instructions`, `record_type`, `message`; their last three were the same shapes. All contained `message`,
`reasoning`, `function_call` and `function_call_output`.

**A third rollout generation.** The envelope generations wrap each item as `{type: 'response_item', payload: {...}}`. This one has no envelope: each line IS the item, at the top level, preceded by a
bare `{id, timestamp, instructions}` header and interleaved with `{"record_type":"state"}` markers. The parser dispatches on `record.payload.type`, which is `undefined` on a bare record, so every
record fell through to a `default` arm guarded by `if (payloadType)` — and was discarded in silence. The record kinds were all already implemented. They were never reached.

Two defects, one fix each:

| Defect                                                        | Fix                                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A whole rollout generation parsed to nothing                  | Unwrap a bare record and treat it as its own payload. The existing cases then handle it unchanged                                    |
| `if (payloadType)` silently dropped any record without a type | Removed. A record that was read and parsed exists, whether or not its shape is understood — that guard defeated the unknown-event    |
|                                                               |   mechanism for exactly the records that needed it                                                                                   |

**Result across the whole store:** 723 rollouts scanned, **0 now parse to zero events**, down from 6. The six now yield 11 to 828 events each, with `tool.call` and `tool.result` counts matching
exactly (237/237 on the largest).

**One judgement recorded rather than assumed.** `{"record_type":"state"}` is 23 bytes, byte-identical every time, with no payload, emitted once per item — 718 of them in the 1.9 MB rollout. These are
skipped rather than emitted as unknown events, and the count is reported as a `state-markers-skipped` diagnostic. That is not the silent drop the unknown-event rule forbids: the rule protects records
that are not UNDERSTOOD, and this one is understood exactly — it carries no information. Emitting it would put a placeholder line beside every real event in the timeline.

Regression coverage: five tests over a SYNTHESIZED fixture, `tests/fixtures/codex/10-bare-generation.jsonl`. Synthesized, not harvested, because all six real rollouts contain work against a company
repository. Three of the five were proven able to fail by reverting the unwrap.
