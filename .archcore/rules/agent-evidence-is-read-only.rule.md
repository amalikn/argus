---
title: Agent evidence stores are read-only
type: rule
status: accepted
date: 20260901
accepted: 20260901
source: AGENTS.md agent evidence is read-only
tags: [adapters, evidence, safety]
promoted_by: skill-ai-it promote
---

# Agent evidence stores are read-only

**Rule.** The extension reads agent transcript stores as forensic evidence and never writes to them. Never modify, repair, truncate, move, archive or delete anything under `~/.claude/projects`,
`~/.codex/sessions`, or `~/.hermes/sessions`. Never write extension output into a scanned directory. Discovery must exclude the extension cache and export directories by path, for every adapter.

**Why.** Two distinct failures. First, the tool exists to tell a user what an agent did; a tool that edits the record cannot be trusted to report it. Second, an export written into a scanned directory
is re-ingested on the next discovery pass and appears as a session that never ran — a fabricated observation presented with the same confidence as a real one.

**How to verify.** No write, rename, unlink or truncate call in the codebase takes a path under a provider root. The exclusion is per-adapter, not only for Codex, because the failure is not
Codex-specific.
