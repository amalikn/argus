# Script Inventory

This file describes runnable scripts, task runners, and automation entrypoints in this project.

<!-- BEGIN MANAGED: skill-ai-it:scripts -->
<!-- skill-ai-it-version: 2026-08-11-governance-checks-layer-v1 -->

## Execution Policy

- Prefer the existing canonical task runner for this project.
- Prefer `just <task>` when a `justfile` is present.
- Do not run scripts marked `destructive`, `review-required`, or `unknown` without review.
- Do not assume arbitrary files under `scripts/` are safe.
- If a script is missing from this inventory, inspect it before use and update or propose an inventory entry.
- Secrets must not be documented here as values. Document only secret names and where they are expected to come from.

## Preferred Execution Order

1. Existing canonical task runner (whichever is established for this project)
2. `just --list` / `just <task>`
3. `scripts/README.md`
4. Other task runners: `Taskfile.yml`, `Makefile`, `package.json`
5. Raw scripts under `scripts/` after inspection

## Maintenance Rules

- Keep this file aligned with: `justfile`, `Taskfile.yml`, `Makefile`, `package.json`, actual files under `scripts/`
- Prefer managed block updates for generated sections.
- Preserve manually written notes unless explicitly replacing them.
- When removing a script, remove or mark its inventory entry stale.
- When adding a script, document purpose, inputs, outputs, safety, idempotency, and when to use it.

<!-- END MANAGED: skill-ai-it:scripts -->
