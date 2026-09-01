# Roadmap — Argus Multi-Agent Observability Fork

Milestone sequence, stop gates and scope tiers. The governing detail lives in
[docs/argus-multi-agent-implementation-plan-20260901_1708.md](docs/argus-multi-agent-implementation-plan-20260901_1708.md); this file tracks position and progress.

## Current phase

**Milestone 1 complete. Halted at Stop 1.** Milestone 2 does not begin without an explicit go.

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
- [ ] **M2 — Provider-neutral core.** Reordered by finding F1: test harness first, because the parity snapshot has nowhere to live without one.
  - [ ] M2.1 Select and wire a test harness
  - [ ] M2.2 Extract and sanitize Claude fixtures (12 of 15 categories sourceable; 3 synthesized)
  - [ ] M2.3 Snapshot current Claude normalized behaviour
  - [ ] M2.4 `PricingProvider` replacing both hardcoded cost tables
  - [ ] M2.5 `AgentSession`, `AgentEvent`, adapter interface, registry, capabilities, diagnostics
- [ ] **M3 — Claude adapter migration.** Move discovery, parsing and watching behind the adapter contract. Harder than planned: watch logic currently lives inside the webview provider.
- [ ] **M4 — UI provider-neutralization.** Largest single chunk, roughly 4700 lines of React.
- [ ] **M5 — Codex discovery and parser.** Read-only historical parsing first.
- [ ] **M6 — Codex live watch and scale hardening.**
- [ ] **M7 — Hermes source audit.** Starts from `~/.hermes/sessions/*.jsonl`; pin the upstream commit audited.
- [ ] **M8 — Hermes adapter.**
- [ ] **M9 — Unified analysis.** De-scopable. Six rules to port, enumerated in finding F9.
- [ ] **M10 — Search, export, privacy.** De-scopable. Smaller than planned: there is no telemetry to strip, only a guard to add.
- [ ] **M11 — CI, performance, release.** De-scopable. Greenfield; upstream has no CI. Extension id must change in both `name` and `publisher`.

## Blockers

| Blocker                                               | Effect                                                | Finding |
| ----------------------------------------------------- | ----------------------------------------------------- | ------- |
| No test infrastructure                                | Stop 2 is not expressible until fixed                 | F1      |
| Cost computed twice from disagreeing hardcoded tables | Multi-provider cost is wrong before it is written     | F5      |
| Live watch owned by a UI class                        | Adapter `watch()` requires extraction, not relocation | F4      |

## Completed

- [x] Plan reviewed and corrected before execution: Hermes source re-anchored, reasoning policy made implementable, storage routing added, stop gates and scope tiers introduced.
- [x] Fork created at `amalikn/argus`, registered as a `tools_stuff` submodule.
- [x] Governance scaffold and an executable coherence checker, proven able to fail.
