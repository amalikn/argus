---
title: Milestone 2 sequence, reordered by finding F1
type: plan
status: proposed
date: 20260901
source: ROADMAP.md; current-state-audit.md findings F1 and fixture inventory
tags: [plan, process]
promoted_by: skill-ai-it promote
---

# Milestone 2 sequence, reordered by finding F1

## Status

Accepted, not started. Gated on an explicit go at Stop 1.

## Sequence

| Step | Work |
|---|---|
| M2.1 | Select and wire a test harness |
| M2.2 | Extract and sanitize Claude fixtures — twelve of fifteen categories are sourceable from real transcripts, three are synthesized |
| M2.3 | Snapshot current Claude normalized behaviour |
| M2.4 | `PricingProvider` replacing both hardcoded cost tables |
| M2.5 | `AgentSession`, `AgentEvent`, adapter interface, registry, capabilities, diagnostics |

## Why the order changed

The plan originally began Milestone 2 with the domain model. Finding F1 established that no test infrastructure exists: `package.json` declares a test script pointing at a path that has never existed,
and no runner is present in the dependency tree. Stop 2 is defined as every fixture normalizing identically to the pre-refactor snapshot, so without a harness that snapshot has nowhere to live and the
gate is not expressible. The harness therefore precedes the model.

## Fixture availability

Measured 20260901 across 10,072 local Claude sessions: malformed-line, truncated-final-line and symlinked-workspace have no natural candidates and are synthesized by hand. The remaining twelve
categories have real candidates. Zero undecodable lines were found in 1,018,178 lines, so malformed-input handling will only ever be exercised by synthetic fixtures unless Codex or Hermes prove
dirtier.
