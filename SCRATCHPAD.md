# SCRATCHPAD

Agent working memory for the Argus multi-agent observability fork. Use for: draft plans, terminal output, intermediate analysis, refactor outlines. Cleared between sessions unless content is
explicitly marked KEEP.

---

<!-- KEEP: populated 20260901_1800 from claude-mem plus this session. memory-keeper and mcp-project-context returned no argus entries. -->

## Contents

- [Current state](#current-state)
- [Open items](#open-items)
- [Key anchors](#key-anchors)
- [Recent decisions](#recent-decisions)
- [Session history (summaries — full detail in claude-mem)](#session-history-summaries-full-detail-in-claude-mem)
- [Next actions](#next-actions)
- [Residual risk — what the 20260901 staleness audit did NOT resolve](#residual-risk-what-the-20260901-staleness-audit-did-not-resolve)
- [Memory pointers (navigation only — content is above)](#memory-pointers-navigation-only-content-is-above)

---

## Current state

**Phase:** Milestones 1 to 8 complete, then a staleness audit, a coherence sweep, and on 20260902 the first work that reaches the SCREEN rather than the model: the extension is launchable, Codex and
Hermes are wired to the webview, and a real parser defect was found and fixed by looking at runtime behaviour instead of at tests. All three providers run behind the adapter contract. Milestones 9 to
11 remain and are all marked de-scopable. The repository now tells one story: `ROADMAP.md` is the completion surface, `SCRATCHPAD.md` holds the residual register, and `.archcore/` outranks both.

The fork lives at `amalikn/argus` on branch `feat/multi-agent-observability`, with the unmodified upstream preserved at tag `baseline-upstream-argus`. All six quality gates now pass, where the
baseline had one that could not run at all. Claude runs behind the adapter contract with its parity snapshots intact, cost resolves through one provider-neutral pricing table, and Codex is
discoverable, parseable, watchable and scale-tested. The UI reads provider identity and capability flags rather than branching on provider.

The one thing still not true: **no provider has been confirmed to display a session.** The extension launches and activates, and both new providers parse correctly against the real local stores, but
`R1` of the runtime render gate is `NOT RUN`. That is the single blocker, and it is a tooling problem rather than a product one.

---

## Open items

- [ ] The `@vscode/test-electron` harness is written but does not run. The downloaded VS Code 1.135.0 app bundle ships a single `Code` executable and no `Electron` one, and that binary rejects every
  CLI flag with `bad option`. Committed in a non-working state alongside the `just gate` recipe, so `just gate` currently FAILS. It must also override `--extensions-dir` and `--user-data-dir`, which
  test-electron defaults to `<repo>/.vscode-test/`, inside the repository.
- [ ] The runtime render gate has never passed. As of 20260902 the extension launches and activates, Codex and Hermes are wired to the webview through the projection, and Claude keeps its original
  path — but no provider has been confirmed to put a session on screen. Run `just edh`, work through [docs/runtime-render-gate.md](docs/runtime-render-gate.md), record the result in its log.
- [ ] The event-native tab is not built. The projection cannot carry per-event `confidence` or an unknown event's payload, so both are invisible in the UI. That tab is where they belong.
- [ ] Claude has not converged onto the projection, deliberately. Two paths are maintained until the generic one is proven richer-or-equal against the sixteen parity fixtures, not merely prettier.
- [ ] Codex tiered above-threshold pricing is stored but not applied, so very long turns are costed at the base rate.

---

## Key anchors

| Item               | Detail                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Fork               | `https://github.com/amalikn/argus`, branch `feat/multi-agent-observability`                            |
| Upstream           | `yessGlory17/argus`, fetch-only, push URL set to `DISABLED_read_only_upstream`                         |
| Baseline           | commit `3bfbd8b`, tag `baseline-upstream-argus`                                                        |
| Plan               | [docs/argus-multi-agent-implementation-plan-20260901_1708.md](docs/argus-multi-agent-implementation-plan-20260901_1708.md)                                            |
| Audit              | [docs/architecture/current-state-audit.md](docs/architecture/current-state-audit.md)                                                               |
| Claude transcripts | `~/.claude/projects` — 10,072 sessions, 1,018,178 lines, 5.03 GB, zero undecodable lines               |
| Codex rollouts     | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` — 722 files, `{type, timestamp, payload}` per line      |
| Hermes sessions    | `~/.hermes/sessions/*.jsonl` — structured per turn, NOT `~/.hermes/logs/`                              |
| Pricing source     | LiteLLM dataset, vendored to `src/pricing/model-pricing.json`, 2571 models                             |
| Node runtime       | 22.23.2 via mise pin                                                                                   |
| Python runtime     | 3.14.7 via `tools-working-cache/argus/venv`                                                            |
| Render gate        | [docs/runtime-render-gate.md](docs/runtime-render-gate.md) — R1 to R6, run by hand, result log treats FAIL and NOT RUN as first-class |
| Launch the host    | `just edh` (or F5). Profile in `tools-working-cache/argus/edh-user-data`                               |
| VS Code test build | `tools-working-cache/argus/vscode-test`                                                                |
| Gate logs and VSIX | `tools-runtime/argus/`                                                                                 |

---

## Recent decisions

- 20260902 — Projection first, event-native tab after. Codex and Hermes reach the webview through `eventsToSessionDetail()`; Claude keeps its original path. The dual path is deliberate, and Claude
  convergence is gated on the generic path proving richer-or-equal against the sixteen parity fixtures, every difference classified. A lossy regression blocks it.
- 20260902 — Five parse outcomes replace `empty-session` in every adapter. A source that held records and produced no events is an ERROR unless every record was explicitly classified as ignorable.
- 20260902 — Unknown semantic content must survive; known structural noise may be suppressed, but suppression must be counted and diagnosed. `{"record_type":"state"}` is skipped with a count.
- 20260902 — Source generations are unwrapped, then dispatched once. Not a parser per generation.
- 20260902 — Stop changing parser semantics (operator). The next useful information can only come from runtime rendering.
- 20260901 — Hermes anchors on `~/.hermes/sessions/*.jsonl`, not `~/.hermes/logs/`. The structured store was located before implementation, so Milestone 7 starts from evidence rather than discovery.
- 20260901 — Reasoning is parsed but gated: never cached as text, masked in the UI, replaced by a placeholder in default exports, included only in the explicit unredacted export. The original absolute
  prohibition was unimplementable because two of three providers persist reasoning in the evidence.
- 20260901 — Pricing comes from the vendored LiteLLM dataset, refreshed by a developer script, never fetched at runtime. An unknown model is absent from the table rather than priced at a fallback
  rate.
- 20260901 — Three hard stop gates added to the milestone sequence. M1 to M6 mandatory, M7 to M8 target, M9 to M11 de-scopable.
- 20260901 — Commits on amalikn remotes use `djmalik@gmail.com`, applied by a `hasconfig:remote.*.url` include in the global git config.
- 20260901 — Generated context artifacts excluded via `.git/info/exclude` rather than `.gitignore`, to keep the upstream-sync merge surface small.

---

## Session history (summaries — full detail in claude-mem)

### 20260902 — render gate, wiring, and a real parser defect
- Made the extension launchable for the first time (`just edh`, F5); upstream shipped no launch configuration, which is why it reached Milestone 8 unrun. `--user-data-dir` is load-bearing: without it
  the `code` CLI silently drops `--extensionDevelopmentPath` and exits 0.
- Wired Codex and Hermes to the webview through a projection, Claude untouched. Found and fixed a THIRD Codex rollout generation: six rollouts up to 1.9 MB parsed to zero events because dispatch read
  a `payload` that bare records do not have. Whole store now 0 of 723 empty.
- Generalized that into an adapter-wide parse-outcome taxonomy, and caught my own dead check in the process — the first version compared raw records against raw records and could never have fired.
- Evidence basis: commits c05264d, 1f253d5, 3ee0c4c, 64a4cce, abdb618, 583d1e2.

### 20260902 — staleness audit and coherence sweep
- Audit found 8 documentation defects behind a green suite, two of them in documents that outrank `AGENTS.md`. Added 4 checks, each proven able to fail.
- Coherence sweep found 5 contradictions: the README told readers this was a Claude-only tool, the router named no adapter or audit, the archcore index count had drifted, residuals lived in two
  places, and six ticked milestones were still described in future tense.
- Promoted the durable rule that a passing suite is never evidence that governance is current. Checks 188 to 274.
- Evidence basis: CHANGELOG 20260901_2359 and 20260902_0030.

### 20260901 — Milestone 8, Hermes adapter
- Built the adapter for both Hermes forms; all three providers now sit behind the contract. 131 tests, 188 checks.
- Hermes fixtures are SYNTHESIZED from the observed schema, not harvested: its sessions are personal Telegram and Discord conversations, and redacting a personal chat leaves a personal chat.
- Confidence is lowest here by design: a shell command is `derived` from a tool name, a delegation is `heuristic`.
- Evidence basis: CHANGELOG 20260901_2330.

### 20260901 — Milestone 7, Hermes audit
- Audited the live store against pinned upstream `5a8e8a6b`; found a second, larger `session_*.json` store the accepted ADR had missed, and superseded that ADR.
- No token usage exists in either Hermes format, so `tokenUsage`, `contextMetrics` and `cost` are all false. Shell exit codes ARE recorded, so status is `exact`.
- The four SQLite stores add nothing; Milestone 8 scope shrank accordingly.
- Evidence basis: docs/adapters/hermes-source-audit.md, CHANGELOG 20260901_2245.

### 20260901 — Milestones 2 to 6
- Test harness (vitest), 16 Claude and 9 Codex sanitized fixtures, and the Claude parity snapshots that gate Stop 2.
- Deleted both hardcoded cost tables for one PricingProvider; found upstream understated cache writes fivefold.
- Claude and Codex both run behind the adapter contract; Codex reads two different rollout format generations.
- 15 MB rollout parses in 381 ms streamed; incremental append costs 4 ms.
- Evidence basis: CHANGELOG entries 20260901_1915 through 20260901_2200.

### 20260901 — plan review, Milestone 1, governance bootstrap
- Reviewed the implementation plan, verified its path and schema claims against live systems, applied four corrections before execution.
- Ran Milestone 1: forked, tagged the baseline, measured all six gates, mapped code to the plan conceptual roles, produced 12 findings, inventoried fixtures across 10,072 sessions.
- Built the pricing layer after finding the upstream hardcoded table overstates opus-4-6 by 3x and silently prices unknown models at Sonnet rates.
- Bootstrapped governance and an executable coherence checker; proved the checker can fail before trusting it.
- Evidence basis: claude-mem observations from 20260901, plus the committed audit.

---

## Next actions

1. **R1 of the runtime render gate.** `just edh`, click the Argus icon, check four things: the view opens, the list populates, Codex sessions appear, they carry a provider badge. Record in the result
   log of [docs/runtime-render-gate.md](docs/runtime-render-gate.md). **This cannot be done by an agent in this environment** — six mechanisms failed, all environmental.
2. **Finish the `@vscode/test-electron` harness**, which removes the human from R1 permanently. Blocked on executable resolution; see the open items.
3. **R2 to R5 straight through**, before any further architecture. The project needs evidence that the product renders, not more evidence that the parser model is internally sound.
4. Event-native tab, for what the projection cannot carry: per-event `confidence`, and the payload and provider identity of an unknown event.
5. Wire `watch()` for projected providers, so the live-watch checks stop being `NOT IMPLEMENTED`.

---

## Residual risk — what the 20260901 staleness audit did NOT resolve

<!-- KEEP -->

Written so a clean run is never mistaken for a verified one.

| Item                                                            | Why it is unresolved                                                                       | What would settle it                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------- |
| The extension has never run in an Extension Development Host    | Every gate is static: build, lint, compile, package, test. Nothing proves it renders a     | Launch it and open one session per    |
|                                                                 |   session                                                                                  |   provider                            |
| Codex and Hermes sessions are not viewable                      | The webview consumes `SessionDetail`, not `AgentEvent`                                     | The generic event renderer            |
| The Hermes adapter rests on a NEGATIVE finding                  | `tokenUsage`/`cost` are false because no usage field exists anywhere in the audited store. | Re-run `just fixtures-verify` after   |
|                                                                 |   If Hermes starts recording usage, the flags become wrong.                                |   any Hermes upgrade                  |
|                                                                 |   `make-hermes-fixtures.py --verify-schema` checks for usage keys appearing, and           |                                       |
|                                                                 |   `tests/hermes-adapter.test.ts` asserts the false values, so the assumption fails loudly  |                                       |
|                                                                 |   rather than silently                                                                     |                                       |
| Hermes fixtures are synthesized, not harvested                  | They prove the adapter handles the SHAPE. They cannot prove it handles content variety the | Nothing safe. Hermes sessions are     |
|                                                                 |   way the Claude and Codex corpora do                                                      |   personal conversations              |
| The installed Hermes build is four months behind upstream       | The audited formats are what a 2026-05 build wrote                                         | Upgrade Hermes, re-run the audit      |
|   `5a8e8a6b`                                                    |                                                                                            |                                       |
| Codex may ship a third rollout format                           | Two exist and both are read; a third would fall through to `provider.unknown`              | Nothing, by construction. The         |
|                                                                 |                                                                                            |   fall-through is the mitigation      |
| Codex tiered above-threshold pricing is stored but not applied  | Long turns are costed at the base rate                                                     | Apply the `tiers` field in            |
|                                                                 |                                                                                            |   `PricingProvider`                   |
| `fs.watch` does not report every change on every platform       | A missed event means a stale view until the next write, not corruption                     | Platform-specific; not worth fixing   |
|                                                                 |                                                                                            |   before the renderer exists          |
| The LiteLLM pricing URL is an external dependency               | `upstreamSha256` makes staleness visible, but the path could move                          | `just pricing-check` on a schedule    |
| `.archcore/README.md` filename conflicts with `archcore status` | Two authorities disagree; deliberately not silenced                                        | An operator decision                  |
| Prices in `src/pricing/model-pricing.json` were NOT regenerated | A price change is a behaviour change and does not belong in a staleness pass               | `just pricing-refresh`, reviewed as   |
|   during this audit                                             |                                                                                            |   its own change                      |

### My own errors this run

- **Finding 5 was self-inflicted.** An earlier ROADMAP edit anchored on table text that `table-reflow` had already padded, so it silently no-opped and the blockers table kept listing three cleared
  blockers as open. I had recorded that exact hazard as a lesson earlier in the same session and repeated it anyway, because nothing checked for the result. `check_no_resolved_finding_asserted_open`
  now does.
- **The audit tool itself introduced finding 6**, appending to the tracked `.gitignore` and contradicting an accepted ADR. Restored byte-exact and routed to `.git/info/exclude`.
- **Commit `05403dd` carries a damaged message** — two words lost to shell backtick expansion. Corrected by a git note rather than a force-push.

## Memory pointers (navigation only — content is above)

- memory-keeper channel `argus`, 24 keys. For THIS session start with `argus.gate.runtime-render-gate`, `argus.gate.electron-harness`, `argus.codex.third-rollout-generation`,
  `argus.diagnostics.parse-outcome-taxonomy`, `argus.view.projection-and-wiring`, `argus.edh.launch-and-automation-limits`, and the rewritten `argus.next.m7-hermes`. For the earlier work start with
  `session.closeout.20260902.argus-m1-m8-audit-coherence`, then `argus.governance.two-control-planes`, `argus.plan.four-corrections`, `argus.audit.findings`, `argus.pricing.f5-measured`,
  `argus.codex.two-format-generations`, `argus.hermes.audit-and-adapter`, `argus.hermes.usage-is-a-logging-gap`, `argus.core.normalized-model-spec`, `argus.adapters.mapping-tables`,
  `argus.tests.inventory-and-gates`, `argus.fixtures.corpus-inventory`, `argus.fixtures.builder-defects`, `argus.governance.archcore-and-checks`, `argus.env.tooling-and-routing`,
  `argus.gotchas.platform-and-tooling`, `argus.milestones.2-6-complete`, `argus.next.m7-hermes`
- memory-keeper checkpoints: `slurp-20260902-render-gate-and-taxonomy` (4b16a65e, 243 items), `closeout-20260902-argus-m1-m8-audit-coherence` (f08121a1, 215 items), `slurp-20260901-argus-m7-m8`
  (a0cd65f9), `slurp-20260901-argus-m1-m6` (d1836c0c)
- mcp-project-context project `argus` id `5a26968b-4e58-4b4f-ba64-a0526a7a4aed`; checkpoints `ea3d0a3a` (20260902 evening), `594a92c1`
- claude-mem: observations across 20260901 and 20260902
