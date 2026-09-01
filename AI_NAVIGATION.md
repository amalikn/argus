# AI Navigation — Argus Multi-Agent Observability Fork

Purpose: this file is the project context entrypoint for AI agents. It tells agents where project truth lives, what to read first, what is authoritative, what is temporary, and what must be updated
after work.

This file is a router, not the full knowledge store.

<!-- BEGIN MANAGED: skill-ai-it:navigation --> <!-- skill-ai-it-version: 2026-08-11-governance-checks-layer-v1 -->

## Contents

- [Mandatory read order](#mandatory-read-order)
- [Source priority](#source-priority)
- [Project context files](#project-context-files)
- [Script and Task Navigation](#script-and-task-navigation)
- [Governance coherence checks](#governance-coherence-checks)
- [Companion consistency](#companion-consistency)
- [Generated context](#generated-context)
- [Context compaction recovery](#context-compaction-recovery)
- [Audit procedure](#audit-procedure)
- [Project-specific routing](#project-specific-routing)

---

## Mandatory read order

Before answering, planning, editing, or creating files in this project, read in this order:

1. `AGENTS.md`
2. `AI_NAVIGATION.md`
3. `context-map.yaml`
4. `CHANGELOG.md`
5. Relevant `.archcore/` documents, if present
6. Relevant `memory-bank/` files, if present
7. Relevant project docs/code based on the task

If available, also consult:

- `graphify-out/GRAPH_REPORT.md`
- `.ai-context/governance-pack.md`

## Source priority

When sources conflict, use this priority:

1. `.archcore/` accepted ADRs, rules, specs, guides, and plans
2. `AGENTS.md` / `CLAUDE.md`
3. `AI_NAVIGATION.md`
4. `context-map.yaml`
5. `CHANGELOG.md`
6. `ARCHITECTURE.md` / `architecture.md`
7. `ROADMAP.md` / `roadmap.md`
8. `memory-bank/activeContext.md`
9. `memory-bank/progress.md`
10. `SCRATCHPAD.md` / `scratchpad.md`
11. old notes, drafts, archived files

`SCRATCHPAD.md` is temporary unless promoted into Archcore, roadmap, memory-bank, or explicitly marked `KEEP`.

## Project context files

| File / Path                           | Role                                                                                 | Authority         |
| ------------------------------------- | ------------------------------------------------------------------------------------ | ----------------- |
| `AGENTS.md`                           | Universal agent instruction file                                                     | High              |
| `CLAUDE.md`                           | Claude-specific bootstrap file                                                       | High              |
| `AI_NAVIGATION.md`                    | Human-readable AI routing file                                                       | High              |
| `context-map.yaml`                    | Machine-readable routing map                                                         | High              |
| `CHANGELOG.md`                        | Durable project/governance change history                                            | Medium-high       |
| `.archcore/adr/`                      | Architecture decisions                                                               | Highest           |
| `.archcore/rules/`                    | Durable project/agent rules                                                          | Highest           |
| `.archcore/specs/`                    | Technical/design contracts                                                           | Highest           |
| `.archcore/guides/`                   | Operational guides                                                                   | High              |
| `.archcore/plans/`                    | Approved implementation plans                                                        | High              |
| `ARCHITECTURE.md` / `architecture.md` | Human-readable architecture overview                                                 | Medium-high       |
| `ROADMAP.md` / `roadmap.md`           | Human-readable roadmap                                                               | Medium-high       |
| `memory-bank/activeContext.md`        | Current working context                                                              | Medium            |
| `memory-bank/progress.md`             | Progress and current state                                                           | Medium            |
| `memory-bank/decisionLog.md`          | Decision notes before promotion                                                      | Medium            |
| `SCRATCHPAD.md` / `scratchpad.md`     | Temporary notes                                                                      | Low               |
| `scripts/check_governance.py`         | Executable governance coherence checks — turns this project's claims into assertions | High              |
| `docs/`                               | Supporting documentation                                                             | Depends on file   |
| `graphify-out/`                       | Generated navigation graph                                                           | Generated support |
| `.ai-context/governance-pack.md`      | Generated deterministic context pack                                                 | Generated support |

## Script and Task Navigation

For script, task, or automation questions, read in this order:

1. Existing canonical task runner if documented
2. `justfile`
3. `scripts/README.md`
4. `Taskfile.yml`
5. `Makefile`
6. `package.json`
7. Raw scripts under `scripts/` after inspection

Prefer `just --list` and `just <task>` when a `justfile` exists.

Do not run uncataloged scripts blindly. Treat uncataloged scripts as `unknown safety` until inspected.

If the catalog is stale, propose an update to `scripts/README.md` or the relevant task runner.

If a task is marked `destructive`, `review-required`, or `unknown`, stop and request review before execution.

## Governance coherence checks

If `scripts/check_governance.py` exists, run it before claiming any durable change is complete, and after any change that adds, moves, renames, or retires a file. It turns this project's governance
claims into assertions and exits non-zero on failure.

When it fails, fix the project — not the check. Broadening an ignore-list or exempting the failing file converts a real finding into a permanent blind spot.

The check count is a coverage signal, not a score, and is expected to rise as the project acquires structure. Adding a new class of artifact, a generated output, or a constant restated across files
requires extending the checker's registries in the same pass.

## Companion consistency

When changing governance files, update these companion files together:

| File                                                       | Companion files                                                             |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `AGENTS.md`                                                | `AI_NAVIGATION.md`, `context-map.yaml`, `scripts/README.md`                 |
| `AI_NAVIGATION.md`                                         | `context-map.yaml`                                                          |
| `context-map.yaml`                                         | `AI_NAVIGATION.md`                                                          |
| `scripts/README.md`                                        | `AGENTS.md`, `context-map.yaml`                                             |
| New script added                                           | `scripts/README.md`, `AGENTS.md`, `justfile`, `scripts/check_governance.py` |
| New artifact class, generated output, or restated constant | `scripts/check_governance.py` registries                                    |

## Generated context

Generated context files (`.ai-context/`, `graphify-out/`) are support-only if present. Do not treat them as canonical truth.

Analysis outputs under `docs/reports/` are analysis records, not replacements for source references, source CSVs, database tables, or governed navigation files.

## Context compaction recovery

After context compaction, rebuild agent context in this order:

1. **Read `AI_NAVIGATION.md`** first — this file is the navigation map.
2. **Load `.archcore/`** — durable project truth (ADRs, rules, specs, guides, plans).
3. **Regenerate `graphify-out/`**: `graphify update .`
4. **Regenerate `.ai-context/`**: `repomix --config repomix.config.json`
5. **Verify `SCRATCHPAD.md`** — if empty, populate from memory-keeper / mcp-project-context.
6. **Verify `CHANGELOG.md`** is current.
7. **Verify `AI_NAVIGATION.md` and `context-map.yaml` companion consistency.**

Label recovered entries: `Context recovered via skill-ai-it context-recovery procedure`.

## Audit procedure

To verify project context coherence, run these checks:

1. Confirm `AGENTS.md` points to `AI_NAVIGATION.md`.
2. Confirm `AI_NAVIGATION.md` points to `context-map.yaml`.
3. Confirm `CHANGELOG.md` exists and recent governance/navigation changes are recorded.
4. Confirm `context-map.yaml` has routing for architecture, planning, governance, implementation, documentation, and scripts.
5. Confirm `.archcore/` is either present and routed, or absent and treated as optional.
6. Confirm generated context paths (`graphify-out/`, `.ai-context/`) are excluded from source-of-truth decisions.
7. Confirm `SCRATCHPAD.md` is marked transient.
8. Confirm repeat-run managed blocks exist where needed.
9. Confirm companion files in `update_rules` were updated when source files changed.
10. Confirm drift/conflict policy says stop-and-report.

<!-- END MANAGED: skill-ai-it:navigation -->

## Project-specific routing

Written by hand, outside the managed block, because it names this project's own artifacts rather than the generic set.

### "How does provider X work?"

1. [docs/adapters/hermes-source-audit.md](docs/adapters/hermes-source-audit.md) for Hermes — the only document that records what its store actually contains, and why `tokenUsage` and `cost` are false.
2. `src/adapters/<provider>/` — `claude-code`, `openai-codex`, `hermes`. The parser is the specification; the audit is the evidence behind it.
3. [.archcore/specs/confidence-markers.spec.md](.archcore/specs/confidence-markers.spec.md) for why the same field is `exact` on one provider and `derived` on another.

### "Why is the code shaped like this?"

1. [.archcore/adr/](.archcore/adr/) — seven decisions, one superseded. Read the index first.
2. [ARCHITECTURE.md](ARCHITECTURE.md) — the component map, including what the fork added on top of the upstream tree.
3. [docs/architecture/current-state-audit.md](docs/architecture/current-state-audit.md) — DATED EVIDENCE of the upstream baseline at `3bfbd8b`, not current state. It carries a banner saying so.

### "What is done and what is left?"

[ROADMAP.md](ROADMAP.md) is the completion surface and the only one. `SCRATCHPAD.md` carries the residual-risk register — what is unresolved as distinct from what is unbuilt. A document that disagrees
with ROADMAP about whether work is finished is wrong unless it declares itself dated evidence, and `check_no_resolved_finding_asserted_open` enforces that.

### "Is the suite passing enough?"

No. See [.archcore/rules/suite-is-not-governance-evidence.rule.md](.archcore/rules/suite-is-not-governance-evidence.rule.md).

