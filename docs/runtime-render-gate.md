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
- [ ] A live append appears without reopening the session

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
- [ ] Concurrent live watchers do not cross-update sessions

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

No run has passed yet. The gate was written on 20260902 alongside the wiring it tests; the extension is known to launch and activate, and no provider has yet been confirmed to render. That is the open
item this document exists to close.
