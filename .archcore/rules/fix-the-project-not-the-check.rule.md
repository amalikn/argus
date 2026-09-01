---
title: When a governance check fails, fix the project
type: rule
status: proposed
date: 20260901
source: AGENTS.md governance-checks managed block
tags: [governance]
promoted_by: skill-ai-it promote
---

# When a governance check fails, fix the project

**Rule.** When `scripts/check_governance.py` fails, fix the project rather than the check. Do not broaden an ignore-list to silence a true positive, and do not exempt the file that failed. A new check
must be able to fail; prove it by breaking the project deliberately and watching it go red. Retiring a check requires recording why.

**Why.** Broadening an ignore-list converts a real finding into a permanent blind spot the next agent has no way to discover. A validator that always fails is one nobody reads, and the next genuine
failure goes unnoticed with it.

**Scope note.** Improving a checks ACCURACY is not narrowing it. On 20260901 the interpreter check was taught to recognize task-runner variable interpolation, because it was flagging correctly-pinned
recipes; and GitHub slugs, git refs and deliberately-external workspace peers were registered as external references. Both widened what the check gets right. Neither reduced what it catches.
