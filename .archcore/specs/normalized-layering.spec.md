---
title: Normalized model layering contract
type: spec
status: accepted
date: 20260901
accepted: 20260901
source: ARCHITECTURE.md target layering; plan sections 4, 5, 7
tags: [adapters, architecture, contract]
promoted_by: skill-ai-it promote
---

# Normalized model layering contract

## Contract

```text
Raw JSONL / logs / SQLite
        |
  Agent Source Adapter        <- the only place provider branching is allowed
  (claude-code | openai-codex | hermes)
        |
  Normalized Agent Model      <- AgentSession, AgentEvent union, capabilities, diagnostics
        |
  +-- Analyzer engine
  +-- Timeline and steps
  +-- Cost and context views
  +-- Dependency graph
  +-- Search and filters
  +-- Live watcher
  +-- Export
```

## Invariants

- No consumer below the adapter layer may import a provider-specific type.
- Every adapter implements the same interface: `detect`, `discover`, `parse`, optional `watch`, `getCapabilities`.
- `AgentProviderId` stays open (`(string & {})`), so adding a provider does not require editing core types.
- Events the parser does not recognize are preserved as unknown events carrying their raw type. A parser that throws on an unrecognized record fails the moment a provider ships a new event type.
- Provider-specific data travels in a namespaced extension field, never by widening a normalized type.

## Enforcement

Reviewable by import graph: a provider module imported from the analyzer or webview is a contract violation.
