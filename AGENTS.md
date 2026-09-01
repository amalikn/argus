@../AGENTS.md

Title: Argus Multi-Agent Observability Fork Agent Policy
Category: agent-governance-guide
Status: current
Authority: local-supplement
Scope: Fork of yessGlory17/argus being evolved into a provider-neutral multi-agent session observability VS Code extension
Last reviewed: 2026-09-01
Summary: Repo-local agent policy for the Argus fork covering fork discipline, provider-adapter boundaries, evidence read-only rules, and runtime routing.

# AGENTS.md

## What this repo is

A fork of [yessGlory17/argus](https://github.com/yessGlory17/argus) (MIT), a VS Code extension that reads Claude Code JSONL transcripts and renders session observability views. The fork is being
evolved into a provider-neutral platform covering Claude Code, OpenAI Codex and Hermes behind a common adapter contract.

The governing plan is [docs/argus-multi-agent-implementation-plan-20260901_1708.md](docs/argus-multi-agent-implementation-plan-20260901_1708.md). The measured starting point is
[docs/architecture/current-state-audit.md](docs/architecture/current-state-audit.md). Read both before changing code; the plan carries corrections that contradict its own earlier drafts, and the audit
carries findings that contradict the plan.

## Fork discipline

- `upstream` is fetch-only. Its push URL is deliberately set to `DISABLED_read_only_upstream`. Do not restore it.
- `origin` is the amalikn fork. Commits here use `djmalik@gmail.com`, applied automatically by a `hasconfig:remote.*.url` rule in the global git config.
- `baseline-upstream-argus` tags the unmodified upstream commit. Never move it. `just diff-baseline` shows total divergence; `just upstream-log` shows what has landed upstream since.
- Upstream history is preserved and not squashed. The MIT license and attribution stay.
- `README.md` is upstream content. Only the managed governance block at its end belongs to the fork, which keeps the merge surface small on upstream sync.

## Provider adapter boundaries

- Provider-specific raw records must never reach the analyzer or the UI as the primary model. Branching on provider belongs in discovery, raw parsing and normalization only.
- Never write `if claude ... else if codex ...` in UI or analysis code. Use the capability flags instead.
- A metric the source does not expose is `undefined`. Zero means the source reported zero. Never synthesize a missing metric, and never fall back to another provider rates or defaults.
- Events the parser does not recognize are data, not errors. Preserve them as unknown events with their raw type.
- Derived facts carry `confidence: "derived"` or `"heuristic"`. Only facts read directly from the source are `"exact"`.

## Agent evidence is read-only

The extension reads agent transcript stores as forensic evidence. It must never write to them.

- Never modify, repair, truncate, move, archive or delete anything under `~/.claude/projects`, `~/.codex/sessions`, or `~/.hermes/sessions`.
- Never write extension output into a scanned directory. An export landing in a provider store is re-ingested as a session that never ran.
- Discovery must exclude the extension cache and export directories by path, for every adapter.

## Runtime and storage routing

Nothing rebuildable belongs in this repository.

| State | Location |
|---|---|
| Node runtime | pinned in `.mise.toml`, resolved through `just` |
| Python runtime | venv at `/Volumes/Data/_ai/_tool/tools-working-cache/argus/venv` |
| npm cache and build scratch | `/Volumes/Data/_ai/_tool/tools-working-cache/argus/` |
| Gate logs, VSIX output | `/Volumes/Data/_ai/_tool/tools-runtime/argus/` |
| Extension runtime cache | VS Code `ExtensionContext.globalStorageUri` |

Every task goes through `just`. Recipes resolve interpreters by absolute path; `just doctor` prints what resolved. Do not add a recipe that calls a bare `python3`, `node` or `npx`.

## Working rules

- Read [AI_NAVIGATION.md](AI_NAVIGATION.md) before answering, planning or editing.
- Run `just baseline` before claiming a change builds. All six gates pass; a red gate is a live regression, not a known state. Finding F1, which made the `test` gate fail at the baseline, was closed in Milestone 2.1.
- Model pricing is a build-time asset. Refresh it with `just pricing-refresh`; never fetch pricing at runtime.
- Time-bound documents use `<slug>-YYYYMMDD_hhmm.md`. Stable entrypoints keep their names.
- Milestones halt at their stop gates. Do not carry work past a stop without an explicit go.

<!-- BEGIN MANAGED: skill-ai-it:navigation -->
<!-- skill-ai-it-version: 2026-08-11-governance-checks-layer-v1 -->

## AI navigation and context preflight

Before answering, planning, editing, or creating files in this project:

1. Read [AI_NAVIGATION.md](AI_NAVIGATION.md).
2. Read [context-map.yaml](context-map.yaml).
3. Read recent entries in [CHANGELOG.md](CHANGELOG.md).
4. Load relevant `.archcore/` context if present.
5. Load relevant `memory-bank/` files if present.
6. Consult generated context when available:
   - `graphify-out/GRAPH_REPORT.md`
   - `.ai-context/governance-pack.md`
7. Before making durable changes, inspect companion-file rules in `context-map.yaml update_rules`. Update all companion files when changing source files.
8. If sources conflict, stop and report the conflict instead of guessing.
9. Do not treat `SCRATCHPAD.md` as durable truth unless content is marked `KEEP` or promoted into `.archcore/`, ROADMAP, or memory-bank.
10. Do not treat Graphify (`graphify-out/`) or Repomix (`.ai-context/`) output as canonical truth. These are generated support artifacts only, always rebuildable.
11. Before running scripts or automation, inspect `justfile`, `scripts/README.md`, `Taskfile.yml`, `Makefile`, and `package.json` when present. Prefer `just --list` and `just <task>` when a `justfile` exists.
12. Treat uncataloged scripts as `unknown` safety until inspected.
13. When adding, modifying, or removing scripts or tasks, update `scripts/README.md` to reflect the change — purpose, inputs, outputs, safety label, and idempotency.
14. If `scripts/check_governance.py` exists, run it before claiming any durable change is complete. When it fails, fix the project, not the check. Adding a new artifact class, generated output, or a constant restated across files requires extending its registries in the same pass.
15. After making changes, update `CHANGELOG.md` for all durable governance/navigation changes.
16. Preserve user-authored content outside managed sections. Do not rewrite custom project notes.

<!-- END MANAGED: skill-ai-it:navigation -->

<!-- managed:skill-ai-it:governance-checks — regenerated by skill-ai-it. Edit the surrounding file freely; edits inside this block may be replaced. -->

## Governance coherence checks

This project's governance claims are executable. [`scripts/check_governance.py`](scripts/check_governance.py) turns them into assertions and ``just check`` gates on them. It is stdlib-only
and exits non-zero on any failure.

**Run it before claiming any durable change is complete**, and after any change that adds, moves, renames, or retires a file. It is cheap and it is the only thing standing between this project's
documents and silent decay.

### The checker grows with the project

The check count is a coverage signal, not a score. It is expected to rise as the project acquires structure. Extend it on these triggers:

| Change made | Required checker update |
|---|---|
| Add a document to a cataloged folder | None — the coverage check fails until the index links it. That is the intended workflow, not an error to route around |
| Add a script or task | Catalog it in `scripts/README.md` and the task runner; coverage fails until then |
| Add a new **class** of artifact (new folder, new document type) | Add a `CATALOGS` entry, plus a contract check if the class has a declared filename or frontmatter form |
| Add a generated artifact | Add a `DERIVED` entry; add a provenance check too if the generator can stamp its source into the output |
| State a threshold, rate, deadline, or canonical path in a new file | Register the file in `CONSTANT_SURFACES`; the sync check fails until it is registered |
| Change a constant's value | Update the owning rule first, then every registered surface, in one pass — the sync check verifies the pass was complete |
| Rename or move a file | Nothing — path resolution catches every stale reference automatically |
| Retire a check | Record why in `CHANGELOG.md`. A silently deleted check is indistinguishable from one that never existed |

### Rules that are not negotiable

- **When a check fails, fix the project, not the check.** Broadening an ignore-list to silence a true positive, or exempting the file that failed, converts a real finding into a permanent blind spot
  that the next agent has no way to discover.
- **A new check must be able to fail.** Prove it by breaking the project deliberately and watching it go red. A check that scans an empty set is an assumption wearing a test's clothes.
- **Text matching does not verify behavior.** Grepping for a threshold's characters does not prove the surrounding logic implements it — a script's output can state a rule its code no longer applies.
  Where a check must verify behavior, execute the behavior and assert on the result.
- **Do not enforce history.** Counts and states recorded as past facts are evidence, not live claims. Mark those lines `<!-- count:asat -->` rather than editing the record to satisfy the checker.

Doctrine, the seven check families, and the artifact-to-check inference table: [the governance-checks pattern](/Volumes/Data/_ai/_skills/skills_stuff/specialists/project/skill-ai-it/patterns/governance-checks.md).

<!-- /managed:skill-ai-it:governance-checks -->

## Canonical governance linkage

- Parent area guidance: [../AGENTS.md](../AGENTS.md)
- Cross-repo governance root: [/Volumes/Data/_ai/governance/README.md](/Volumes/Data/_ai/governance/README.md)
