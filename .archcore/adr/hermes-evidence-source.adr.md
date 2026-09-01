---
title: Hermes adapter reads the structured session store, not the logs
type: adr
status: superseded
date: 20260901
accepted: 20260901
source: SCRATCHPAD.md decisions, verified against the live filesystem 20260901
tags: [adapters, evidence]
superseded_by: hermes-snapshot-is-primary.adr.md
promoted_by: skill-ai-it promote
---

# Hermes adapter reads the structured session store, not the logs

> **Superseded on 20260901 by [hermes-snapshot-is-primary.adr.md](hermes-snapshot-is-primary.adr.md).** The conclusion below is correct but incomplete: `sessions/` holds a second,
> larger `session_*.json` store that this document did not find. Retained because the reasoning that displaced the original `logs/` premise still stands.

## Context

The original implementation plan anchored the Hermes adapter on `~/.hermes/logs/`, describing it as the validated basis. Checked against the live filesystem on 20260901, Hermes writes a structured
per-turn JSONL store at `~/.hermes/sessions/<YYYYMMDD>_<HHMMSS>_<shortid>.jsonl`, carrying `role`, `timestamp`, `model`, `platform`, `tools`, `content`, `tool_calls`, `finish_reason`, `reasoning` and
`reasoning_content`. The formatted logs are rotated text and carry strictly less.

## Decision

`~/.hermes/sessions/*.jsonl` is the canonical Hermes evidence source. `~/.hermes/logs/` is fallback only. `state.db`, `response_store.db`, `verification_evidence.db` and `checkpoints/` are audited in
Milestone 7 for what they add over the JSONL, read-only.

## Consequences

- Milestone 7 starts from a known store rather than from discovery, removing most of its uncertainty.
- Hermes rows are OpenAI-chat-shaped, so session lifecycle, subagent attribution and dependency edges must be derived rather than read. See [confidence markers](../specs/confidence-markers.spec.md).
- The upstream repository moves fast. Pin the commit audited, or the audit describes a version that no longer exists.
