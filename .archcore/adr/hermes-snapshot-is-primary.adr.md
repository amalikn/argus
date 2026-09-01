---
title: The Hermes snapshot store is primary, and the JSONL mirror is secondary
type: adr
status: accepted
date: 20260901
accepted: 20260901
source: docs/adapters/hermes-source-audit.md
tags: [adapters, evidence, hermes]
supersedes: hermes-evidence-source.adr.md
promoted_by: Milestone 7 audit
---

# The Hermes snapshot store is primary, and the JSONL mirror is secondary

## Context

[The earlier ADR](hermes-evidence-source.adr.md) established that Hermes evidence lives in `~/.hermes/sessions/*.jsonl` rather than in `~/.hermes/logs/`. That correction was right and it displaced a
wrong premise in the implementation plan. It was also incomplete, and the Milestone 7 audit found the gap.

`~/.hermes/sessions/` holds two formats written by two different writers. Measured on 2026-09-01: 60 `*.jsonl` files totalling 18.2 MB and 4,601 rows, against 243 `session_*.json` files totalling
119.9 MB and 33,668 messages. Every one of the 60 JSONL stems appears as a `session_id` inside the JSON store, so the two describe the same sessions and the JSON store is a strict superset.

The JSON snapshot also carries what the JSONL mirror lacks: an explicit `session_id`, `session_start`, `last_updated` and a `message_count` that matches `len(messages)` on all 243 files.

## Decision

`sessions/session_*.json` is the primary Hermes evidence source. `sessions/*.jsonl` is secondary, used for live tailing where following a growing file is cheaper than re-reading a rewritten snapshot.
`~/.hermes/logs/` remains fallback only, as the superseded ADR established.

Session ids come from the in-record `session_id`. The filename is used only for the JSONL mirror, which has no alternative, and that derivation is marked `confidence: "derived"`.

## Consequences

- 76 of 243 filenames disagree with the `session_id` inside the file. Keying on the filename would have mis-identified nearly a third of the store.
- `startedAt` and `updatedAt` become read facts rather than inferences, so they are marked `exact`.
- `message_count` gives a free integrity assertion the adapter should make.
- The live watcher and the historical parser read different files for the same session, so the adapter must reconcile them by `session_id` rather than by path.

## Why this was not caught earlier

The earlier ADR was written from a filesystem check that looked for the structured store and found it. It did not ask whether there was a second one. The lesson generalizes: confirming that a source
exists is not the same as establishing that it is the only source, and the second question is the one that was skipped.
