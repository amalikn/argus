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

**Phase:** Milestones 1 to 8 complete and pushed. All three providers run behind the adapter contract. Milestones 9 to 11 remain and are all marked de-scopable.

The fork lives at `amalikn/argus` on branch `feat/multi-agent-observability`, with the unmodified upstream preserved at tag `baseline-upstream-argus`. All six quality gates now pass, where the
baseline had one that could not run at all. Claude runs behind the adapter contract with its parity snapshots intact, cost resolves through one provider-neutral pricing table, and Codex is
discoverable, parseable, watchable and scale-tested. The UI reads provider identity and capability flags rather than branching on provider.

---

## Open items

- [ ] Milestone 8: the Hermes adapter. Primary source is `sessions/session_*.json`, not the JSONL mirror; ids come from the record, never the filename; `tokenUsage`, `contextMetrics` and `cost` are
  all false.
- [ ] The generic event renderer is not built. The webview still consumes `SessionDetail`, so a Codex session is parseable but not yet viewable.
- [ ] Extension never launched in an Extension Development Host. Every gate is static; nothing yet proves it renders a session.
- [ ] Codex tiered above-threshold pricing is stored but not applied, so very long turns are costed at the base rate.
- [ ] The 21 promoted `.archcore/` documents are `status: proposed`. Review and move each to `accepted`, or reject it.

---

## Key anchors

| Item               | Detail                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Fork               | `https://github.com/amalikn/argus`, branch `feat/multi-agent-observability`                       |
| Upstream           | `yessGlory17/argus`, fetch-only, push URL set to `DISABLED_read_only_upstream`                    |
| Baseline           | commit `3bfbd8b`, tag `baseline-upstream-argus`                                                   |
| Plan               | [docs/argus-multi-agent-implementation-plan-20260901_1708.md](docs/argus-multi-agent-implementation-plan-20260901_1708.md)                                       |
| Audit              | [docs/architecture/current-state-audit.md](docs/architecture/current-state-audit.md)                                                          |
| Claude transcripts | `~/.claude/projects` — 10,072 sessions, 1,018,178 lines, 5.03 GB, zero undecodable lines          |
| Codex rollouts     | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` — 722 files, `{type, timestamp, payload}` per line |
| Hermes sessions    | `~/.hermes/sessions/*.jsonl` — structured per turn, NOT `~/.hermes/logs/`                         |
| Pricing source     | LiteLLM dataset, vendored to `src/pricing/model-pricing.json`, 2571 models                        |
| Node runtime       | 22.23.2 via mise pin                                                                              |
| Python runtime     | 3.14.7 via `tools-working-cache/argus/venv`                                                       |
| Gate logs and VSIX | `tools-runtime/argus/`                                                                            |

---

## Recent decisions

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

- Decide whether to take Milestone 9 to 11, or to stop at a shippable three-provider parse layer with no viewer for the two new providers.
- Consider the generic event renderer now that two real provider shapes exist to design against.

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

- memory-keeper channel `argus`, keys: `argus.plan.four-corrections`, `argus.audit.findings`, `argus.pricing.f5-measured`, `argus.core.normalized-model-spec`, `argus.adapters.mapping-tables`,
  `argus.codex.two-format-generations`, `argus.fixtures.builder-defects`, `argus.fixtures.corpus-inventory`, `argus.tests.inventory-and-gates`, `argus.governance.archcore-and-checks`,
  `argus.env.tooling-and-routing`, `argus.gotchas.platform-and-tooling`, `argus.milestones.2-6-complete`, `argus.next.m7-hermes`
- memory-keeper checkpoint: `slurp-20260901-argus-m1-m6` (id d1836c0c, 202 items)
- mcp-project-context project `argus` id `5a26968b-4e58-4b4f-ba64-a0526a7a4aed`; checkpoint `slurp-20260901-argus-m1-m6` (id f0b9ae18)
- claude-mem: observations from 20260901 across the whole session
