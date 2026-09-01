---
title: Archcore index
type: guide
status: accepted
date: 20260901
source: skill-ai-it promote, carried from ARCHCORE_PROMOTION_CANDIDATES.md
tags: [governance, index]
---

# Archcore — durable project truth

Structured, versioned project truth for the Argus multi-agent observability fork. Highest authority in the source-priority order defined by [AI_NAVIGATION.md](../AI_NAVIGATION.md): where a document
here disagrees with `AGENTS.md`, a narrative doc or `SCRATCHPAD.md`, this wins unless it is marked draft.

Every document below carries a `source:` header naming where it was promoted from, and an `accepted:` date recording when it took effect.

## Contents

- [Status of the set](#status-of-the-set)
- [adr — architecture decisions](#adr-architecture-decisions)
- [rules — durable project and agent rules](#rules-durable-project-and-agent-rules)
- [specs — design and data contracts](#specs-design-and-data-contracts)
- [guides — operating procedures](#guides-operating-procedures)
- [plans — accepted implementation plans](#plans-accepted-implementation-plans)
- [Deliberately never promoted](#deliberately-never-promoted)
- [How to propose another](#how-to-propose-another)

## Status of the set

Promoted 20260901 by `skill-ai-it promote` from `ARCHCORE_PROMOTION_CANDIDATES.md`, which was deleted in the same pass because a queue that outlives its proposals becomes a stale second index.

All twenty-one documents were reviewed and moved to `status: accepted` on 20260901, and each carries an `accepted:` date beside its `date:`. They now sit at the top of the source-priority order: where
one of them disagrees with `AGENTS.md`, a narrative document or `SCRATCHPAD.md`, the Archcore document wins. Superseding one means writing a replacement that names it, not editing it in place.

## adr — architecture decisions

| Document                                  | Governs                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [0001 Hermes evidence source](adr/hermes-evidence-source.adr.md)               | SUPERSEDED. Hermes reads `~/.hermes/sessions/*.jsonl`, not the logs. Reverses the original plan premise      |
| [Hermes snapshot is primary](adr/hermes-snapshot-is-primary.adr.md)                | `sessions/session_*.json` is the primary store; the JSONL mirror is secondary. Supersedes the entry above    |
| [0002 Reasoning parse-then-gate](adr/reasoning-parse-then-gate.adr.md)            | Reasoning is parsed, masked in UI, placeholdered in default exports. Replaces an unimplementable prohibition |
| [0003 Vendored pricing](adr/vendored-pricing.adr.md)                     | Pricing comes from a vendored LiteLLM dataset; unknown models yield no cost                                  |
| [0004 Stop gates and scope tiers](adr/stop-gates-and-scope-tiers.adr.md)           | Three mandatory halts; M1-M6 mandatory, M7-M8 target, M9-M11 de-scopable                                     |
| [0005 Provider-neutral core](adr/provider-neutral-core.adr.md)                | Provider records never reach the analyzer or UI. The central constraint of the fork                          |
| [0006 Generated artifacts excluded locally](adr/generated-artifacts-excluded-locally.adr.md) | `graphify-out/` and `.ai-context/` excluded in `.git/info/exclude`, not `.gitignore`                         |

## rules — durable project and agent rules

| Document                                 | Governs                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| [0001 Upstream is fetch-only](rules/upstream-is-fetch-only.rule.md)              | The upstream push URL stays disabled                                           |
| [0002 Agent evidence is read-only](rules/agent-evidence-is-read-only.rule.md)         | Never write to a provider transcript store, and never into a scanned directory |
| [0003 Undefined is not zero](rules/undefined-is-not-zero.rule.md)               | A missing metric is undefined; zero means the source said zero                 |
| [0004 No provider conditionals downstream](rules/no-provider-conditionals-downstream.rule.md) | Capability flags, never provider ids, in UI and analysis code                  |
| [0005 No bare interpreters](rules/no-bare-interpreters.rule.md)                | Recipes address pinned interpreters by path. Machine-enforced                  |
| [0006 Fix the project, not the check](rules/fix-the-project-not-the-check.rule.md)      | Never narrow a governance check to make a run green                            |
| [0007 Anti-patterns](rules/anti-patterns.rule.md)                       | Seven named defects, each observed rather than hypothetical                    |

## specs — design and data contracts

| Document                    | Governs                                                                   |
| --------------------------- | ------------------------------------------------------------------------- |
| [0001 Normalized layering](specs/normalized-layering.spec.md)    | The adapter boundary and what may import what                             |
| [0002 Confidence markers](specs/confidence-markers.spec.md)     | `exact` versus `derived` versus `heuristic`, and why the providers differ |
| [0003 Pricing table contract](specs/pricing-table-contract.spec.md) | Shape and invariants of `src/pricing/model-pricing.json`                  |
| [0004 Type discriminators](specs/type-discriminators.spec.md)    | Discriminated unions on a literal `kind`; open provider id                |

## guides — operating procedures

| Document                       | Governs                                                  |
| ------------------------------ | -------------------------------------------------------- |
| [0001 Baseline gate procedure](guides/baseline-gate-procedure.guide.md)   | Running `just baseline` and reading its result honestly  |
| [0002 Pricing refresh procedure](guides/pricing-refresh-procedure.guide.md) | Refreshing and drift-checking the vendored pricing table |

## plans — accepted implementation plans

| Document                             | Governs                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------- |
| [0001 Multi-agent implementation plan](plans/multi-agent-implementation-plan.plan.md) | Pointer to the full plan plus the four corrections applied before execution |
| [0002 Milestone 2 sequence](plans/milestone-2-sequence.plan.md)            | Why the harness precedes the domain model                                   |

## Deliberately never promoted

Carried out of the candidates file before it was deleted, so a future scan does not re-propose the same rejected material.

| Item                                                  | Reason                                                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `CHANGELOG.md` entries                                | History and corroboration only, never a source of durable truth                                             |
| Open items in `SCRATCHPAD.md`                         | Transient. Resolve before promoting                                                                         |
| Findings F1 to F12 as individual records              | Point-in-time measurements of one commit, not durable rules. The decisions they caused are promoted instead |
| Rules inherited from the parent or global `AGENTS.md` | Already governed upstream; promoting them would duplicate policy                                            |
| `graphify-out/`, `.ai-context/`, `repomix-output.md`  | Generated, rebuildable, never canonical                                                                     |
| M9 to M11 roadmap items                               | Marked de-scopable, so not accepted plans                                                                   |
| The full plan text                                    | Kept as a document and referenced, not copied. A duplicated specification drifts                            |

## How to propose another

Add the candidate to a governance surface first — a decision in `SCRATCHPAD.md` under a `KEEP` marker, a rule in `AGENTS.md`, a contract in `ARCHITECTURE.md` — then run `/skill-ai-it refresh` to
regenerate `ARCHCORE_PROMOTION_CANDIDATES.md`, review it, and run `/skill-ai-it promote`. Do not hand-author a file here without that trail: the `source:` header is what makes a document auditable
later.
