---
title: Confidence markers on normalized events
type: spec
status: proposed
date: 20260901
source: ARCHITECTURE.md key decisions; adr 0001
tags: [adapters, contract, evidence]
promoted_by: skill-ai-it promote
---

# Confidence markers on normalized events

## Contract

Every normalized event carries a confidence value:

| Value | Meaning |
|---|---|
| `exact` | Read directly from the source record |
| `derived` | Computed from source records by a rule that is deterministic but not stated by the source |
| `heuristic` | Inferred by pattern, and may be wrong |

## Why this is a contract and not a convention

The three providers differ exactly here. Codex rollouts carry a `type` discriminant (`session_meta`, `response_item`, `event_msg`, `turn_context`) that maps almost directly onto the normalized event
union, so most Codex events are `exact`. Hermes rows are OpenAI-chat-shaped: session lifecycle boundaries, subagent attribution and dependency edges have to be inferred, so they are `derived` or
`heuristic` and never `exact`. Claude stores subagents as sibling files under `<projectDir>/<sessionId>/subagents/`, so parent linkage is `derived` from layout.

Without the marker, a UI showing a Hermes dependency graph would present an inference with the same authority as a recorded fact.

## Enforcement

An adapter that marks a derived event `exact` is a defect. The Hermes adapter in particular must not emit `exact` for lifecycle or subagent events.
