---
title: Provider-specific records never reach the analyzer or the UI
type: adr
status: proposed
date: 20260901
source: AGENTS.md provider adapter boundaries; ARCHITECTURE.md
tags: [adapters, architecture, boundaries]
promoted_by: skill-ai-it promote
---

# Provider-specific records never reach the analyzer or the UI

## Context

Upstream is Claude-shaped end to end: `src/types/parser.ts` carries `RawEvent` and `ToolUseResult*` records that flow into the analyzer and the webview. Adding a second agent to that structure means
changing every consumer, which is the rewrite this fork exists to avoid.

## Decision

Raw source records are consumed only by an adapter, which emits a normalized model. Everything downstream — analyzer, timeline, cost views, dependency graph, search, live watcher, export — consumes
only the normalized model. Provider branching is permitted in discovery, raw parsing and normalization, and nowhere else. The UI decides what to display from capability flags, never from a provider id.

## Consequences

- A fourth agent is an adapter, not a rewrite. That is the entire value proposition of the fork.
- The UI is roughly 4700 lines of React and is the largest single conversion, not the core model.
- The rule is enforceable in review by a simple test: a provider id appearing in UI or analysis code is a defect.
