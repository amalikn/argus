---
title: Reasoning is parsed, then gated — not prohibited
type: adr
status: accepted
date: 20260901
accepted: 20260901
source: SCRATCHPAD.md decisions; plan section 20.1
tags: [privacy]
promoted_by: skill-ai-it promote
---

# Reasoning is parsed, then gated — not prohibited

## Context

The plan originally carried an absolute rule: do not expose hidden or private reasoning. That rule is unimplementable, because two of the three supported providers persist reasoning inside the very
evidence this tool exists to read. Hermes session rows carry `reasoning` and `reasoning_content`; Codex rollouts carry reasoning response items. A rule forbidding what the source hands you cannot be
tested, and will be ignored the first time it collides with a parser.

## Decision

Separate parsing from display and export.

| Stage | Behaviour |
|---|---|
| Parse | Reasoning IS parsed into a `ReasoningEvent`. Never silently dropped, because dropping it hides parse failures and makes sequence numbering lie |
| Cache and index | Never persisted as text. Presence, event count and token count only |
| Render | Collapsed and masked by default; revealed only on explicit opt-in |
| Export, default | Placeholder recording that reasoning existed, its count and its tokens |
| Export, unredacted | Included, behind the same warning that governs other unredacted content |
| Capability flag | `reasoningMetadata` reports what the PROVIDER exposes, independent of what the user chose to show |

Setting: `argusMultiAgent.privacy.showReasoning`, default `false`.

## Consequences

- The rule became testable: a fixture containing reasoning must produce a default export with zero reasoning text, asserted by substring search, and an opt-in export with the text intact.
- A prohibition was replaced by a mechanism. The prohibition would have been silently violated; the mechanism fails loudly.
