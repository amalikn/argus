---
title: No provider conditionals in UI or analysis code
type: rule
status: accepted
date: 20260901
accepted: 20260901
source: AGENTS.md provider adapter boundaries
tags: [adapters, architecture]
promoted_by: skill-ai-it promote
---

# No provider conditionals in UI or analysis code

**Rule.** Never write `if (providerId === "claude") ... else if ...` in UI or analysis code. Use capability flags. Provider branching belongs in discovery, raw parsing and normalization only.

**Why.** The adapter contract exists precisely so that provider knowledge does not spread. Once one conditional lands in the UI, the next agent adds a branch beside it, and the fork is back to the
structure it was created to escape.

**How to verify.** Grep the analyzer and webview for provider identifiers. Any hit is a defect. Capability-driven rendering is the substitute, and it also fixes the empty-state problem: a provider with
no cost data shows no cost panel rather than a zero.
