---
title: No task recipe calls a bare interpreter
type: rule
status: accepted
date: 20260901
accepted: 20260901
source: AGENTS.md runtime and storage routing; check_governance.py check_interpreter_pinning
tags: [tooling]
promoted_by: skill-ai-it promote
---

# No task recipe calls a bare interpreter

**Rule.** No `just` recipe or script calls a bare `python3`, `node`, `npx` or `ruby`. Python is addressed by absolute path at the working-cache venv; Node resolves from the `.mise.toml` pin. Every
Python recipe depends on `_require-venv`.

**Why.** A bare interpreter resolves to whatever the host has on `PATH`, which is not what the project pins. The failure mode is that it WORKS — on the machine it was written on, until a Homebrew
update or a different machine, at which point it fails inside a script and reads like a code bug rather than an environment one.

**How to verify.** Machine-enforced. `scripts/check_governance.py` scans the task runner and fails on a bare interpreter; the check was proven able to fail by adding one deliberately and watching it go
red. `just doctor` prints what actually resolved.
