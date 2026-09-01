---
title: Generated context artifacts are excluded locally, not via .gitignore
type: adr
status: proposed
date: 20260901
source: ARCHITECTURE.md key decisions; CHANGELOG.md 20260901_1745
tags: [fork, tooling]
promoted_by: skill-ai-it promote
---

# Generated context artifacts are excluded locally, not via .gitignore

## Context

`graphify-out/` and `.ai-context/` are regenerable support artifacts. Excluding them by editing the upstream `.gitignore` would add a tracked change to a file upstream also edits, enlarging the merge
surface on every sync for no benefit.

## Decision

Exclude them in `.git/info/exclude`, which is local and untracked. The same reasoning governs the `README.md` edit being confined to deletions.

## Consequences

- A fresh clone of the fork sees them as untracked until regenerated. Acceptable, since both are one command away.
- The decision is invisible to anyone who clones the fork, so it is recorded here rather than only in the exclude file.
