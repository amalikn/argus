---
title: Milestones halt at three stop gates, and late milestones are de-scopable
type: adr
status: accepted
date: 20260901
accepted: 20260901
source: SCRATCHPAD.md decisions; ROADMAP.md
tags: [process]
promoted_by: skill-ai-it promote
---

# Milestones halt at three stop gates, and late milestones are de-scopable

## Context

The implementation sequence originally had no stop points. Across a fifty-four section specification that means weeks of unreviewed work before anyone learns whether the premise held.

## Decision

Three mandatory halts, and three scope tiers.

| Stop | After | Report must show |
|---|---|---|
| Stop 1 | M1 | The real baseline: which gates exist, which pass, which fail, and the exact upstream commit recorded |
| Stop 2 | M3 | Claude parity green — every fixture normalizes identically to the pre-refactor snapshot |
| Stop 3 | M6 | Codex historical parse plus live watch against real rollouts, with the large-file budget met |

Mandatory: M1 to M6, which is a shippable Claude plus Codex product on its own. Target: M7 to M8. De-scopable: M9 to M11, each independently deferrable without leaving a half-wired tree.

## Consequences

- Stop 2 is not expressible until a test harness exists, which is why finding F1 reordered Milestone 2 to put the harness first.
- Work stopped at any tier boundary still builds, packages and passes its gates.
