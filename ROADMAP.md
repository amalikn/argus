# Roadmap — Argus Multi-Agent Observability Fork

Milestone sequence, stop gates and scope tiers. The governing detail lives in
[docs/argus-multi-agent-implementation-plan-20260901_1708.md](docs/argus-multi-agent-implementation-plan-20260901_1708.md); this file tracks position and progress.

## Current phase

**Milestones 1 to 8 complete.** All three providers run behind the adapter contract. Stops 1, 2 and 3 all reported green. Milestones 9 to 11 remain, all marked de-scopable.

## Stop gates

Three halts are mandatory. At each, stop and report; do not proceed without an explicit go.

| Stop   | After | Report must show                                                                                     |
| ------ | ----- | ---------------------------------------------------------------------------------------------------- |
| Stop 1 | M1    | The real baseline: which gates exist, which pass, which fail, and the exact upstream commit recorded |
| Stop 2 | M3    | Claude parity green — every fixture normalizes identically to the pre-refactor snapshot              |
| Stop 3 | M6    | Codex historical parse plus live watch against real local rollouts, with the large-file budget met   |

## Scope tiers

- **Mandatory — M1 to M6.** Claude parity plus Codex. Shippable on its own.
- **Target — M7 to M8.** Hermes.
- **De-scopable — M9 to M11.** Each independently deferrable; if cut, the extension still builds, packages and passes its gates.

## Milestones

- [x] **M1 — Audit and baseline.** Fork established, baseline tagged, six gates measured, code mapped to the plan conceptual roles, 12 findings recorded, fixture inventory across 10,072 sessions,
  pricing layer built. No source file modified.
- [x] **M2 — Provider-neutral core.** Reordered by finding F1: test harness first, because the parity snapshot had nowhere to live without one.
  - [x] M2.1 Select and wire a test harness
  - [x] M2.2 Extract and sanitize Claude fixtures (12 of 15 categories sourceable; 3 synthesized)
  - [x] M2.3 Snapshot current Claude normalized behaviour
  - [x] M2.4 `PricingProvider` replacing both hardcoded cost tables
  - [x] M2.5 `AgentSession`, `AgentEvent`, adapter interface, registry, capabilities, diagnostics
- [x] **M3 — Claude adapter migration.** Discovery, parsing and watching moved behind the adapter contract. Harder than planned, as expected: watch logic had to be extracted from the webview provider
  (finding F4). Stop 2 green — all 16 parity snapshots held.
- [x] **M4 — UI provider-neutralization.** Provider badges, a provider filter and capability-gated panels. The generic event renderer was deliberately deferred and is the largest open item.
- [x] **M5 — Codex discovery and parser.** Read-only historical parsing, reading both rollout format generations.
- [x] **M6 — Codex live watch and scale hardening.** Offset-resumable incremental reads. Stop 3 green — 15 MB in 381 ms, incremental append 4 ms.
- [x] **M7 — Hermes source audit.** Complete. Found a second, larger `session_*.json` store the accepted ADR had missed; superseding ADR written. No token usage exists in either format.
- [x] **M8 — Hermes adapter.** Reads the snapshot as primary and the mirror as secondary. All three providers now sit behind the contract.
- [ ] **M9 — Unified analysis.** De-scopable. Six rules to port, enumerated in finding F9.
- [ ] **M10 — Search, export, privacy.** De-scopable. Smaller than planned: there is no telemetry to strip, only a guard to add.
- [ ] **M11 — CI, performance, release.** De-scopable. Greenfield; upstream has no CI. Extension id must change in both `name` and `publisher`.

## Blockers

All three blockers recorded at Milestone 1 are cleared.

| Blocker                                               | Finding | Resolution                                                                       |
| ----------------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| No test infrastructure                                | F1      | vitest wired in M2.1; Stop 2 became expressible and reported green               |
| Cost computed twice from disagreeing hardcoded tables | F5      | Both deleted in M2.4 for one `PricingProvider`; unknown model yields `undefined` |
| Live watch owned by a UI class                        | F4      | Extracted in M3, moved to core in M6                                             |

### Open

Work items only. The full picture of what is unresolved — including risks that are not work items, such as the Hermes adapter resting on a negative finding — is the residual-risk register in
[SCRATCHPAD.md](SCRATCHPAD.md). That register is the single source; this table lists only the subset that is buildable.

| Item                                                        | Effect                                                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Generic event renderer not built                            | The webview still consumes `SessionDetail`, so Codex and Hermes sessions parse but are not viewable |
| Never launched in an Extension Development Host             | Every gate is static; nothing proves it renders a session                                           |
| Codex tiered above-threshold pricing stored but not applied | Very long turns are costed at the base rate                                                         |

## Completed

- [x] Plan reviewed and corrected before execution: Hermes source re-anchored, reasoning policy made implementable, storage routing added, stop gates and scope tiers introduced.
- [x] Fork created at `amalikn/argus`, registered as a `tools_stuff` submodule.
- [x] Governance scaffold and an executable coherence checker, proven able to fail.
