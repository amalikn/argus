---
title: Multi-agent observability implementation plan
type: plan
status: proposed
date: 20260901
source: docs/argus-multi-agent-implementation-plan-20260901_1708.md
tags: [plan]
promoted_by: skill-ai-it promote
---

# Multi-agent observability implementation plan

## Status

Accepted. The full text is [docs/argus-multi-agent-implementation-plan-20260901_1708.md](../../docs/argus-multi-agent-implementation-plan-20260901_1708.md) — fifty-four sections, kept as a document
rather than copied here because it is the working specification and would drift if duplicated.

## What this record fixes

The plan was reviewed before execution and four corrections were applied. Each is marked inline in the plan as `[CORRECTION 2026-09-01]`:

1. Hermes was anchored on the wrong evidence source — see [adr 0001](../adr/hermes-evidence-source.adr.md).
2. The reasoning-exposure rule was unimplementable — see [adr 0002](../adr/reasoning-parse-then-gate.adr.md).
3. Runtime, cache and export paths were unrouted against workspace policy.
4. The sequence had no review stops and no de-scope tiers — see [adr 0004](../adr/stop-gates-and-scope-tiers.adr.md).

## Verified premises

Section 0 of the plan records which of its path and schema claims were checked against live systems on 20260901 and which remain unverified, with evidence labels. Re-verify at implementation time;
they are current-state observations, not stable APIs.
