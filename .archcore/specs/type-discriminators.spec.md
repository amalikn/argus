---
title: Normalized types are discriminated unions
type: spec
status: proposed
date: 20260901
source: CONVENTIONS.md TypeScript section; plan section 5
tags: [contract]
promoted_by: skill-ai-it promote
---

# Normalized types are discriminated unions

## Contract

- `AgentEvent` is a discriminated union on a literal `kind` field (`shell.command`, `file.read`, `file.write`, `file.edit`, `mcp.call`, and the rest).
- Event classes are never distinguished by which optional fields happen to be present.
- `AgentProviderId` is `"claude-code" | "openai-codex" | "hermes" | (string & {})` — open, so a new provider does not force a core-type edit and a rebuild of every consumer.
- Optional metric fields mean unknown. See [rule 0003](../rules/undefined-is-not-zero.rule.md).

## Why

Optional-field discrimination fails silently: two event classes that share a field shape become indistinguishable to the compiler, and the error surfaces as a rendering bug rather than a type error. A
literal discriminant makes the exhaustiveness check do the work.
