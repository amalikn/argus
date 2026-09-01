---
title: Model pricing is vendored from LiteLLM and never fetched at runtime
type: adr
status: proposed
date: 20260901
source: SCRATCHPAD.md decisions; current-state-audit.md finding F5
tags: [cost, privacy]
promoted_by: skill-ai-it promote
---

# Model pricing is vendored from LiteLLM and never fetched at runtime

## Context

Upstream computes cost from two hardcoded Claude-only tables, in `parserService.ts` and `types/models.ts`, which disagree with each other and with published pricing. Measured 20260901,
`claude-opus-4-6` was hardcoded at 15.00 in / 75.00 out per million against a published 5.00 / 25.00 — a threefold overstatement. Both implementations fall back to Sonnet pricing for any unrecognized
model, so a Codex or Hermes session would be silently costed at Anthropic rates.

## Decision

Pricing comes from the LiteLLM public dataset (`BerriAI/litellm`, MIT), normalized and vendored to `src/pricing/model-pricing.json` by `scripts/refresh-pricing.mjs`. Refresh is a developer action, not
a runtime call. An unknown model is ABSENT from the table, so the consumer reports unknown rather than free or fallback-priced. Cache-write price is emitted only when the publisher publishes it.

CodeBurn (`getagentseal/codeburn`, MIT) solves the same problem for the same agents and its normalized shape was used as the reference; the implementation is independent.

## Consequences

- Local-first is preserved: no network call while a user browses sessions.
- Provenance travels with the data — source url, repo, license, etag, `retrievedAt`, `upstreamSha256` — so a stale price is visible rather than silent, and `just pricing-check` reports drift.
- Tiered above-threshold pricing is retained verbatim, because which tier applies depends on per-turn context size that only the parser knows.
