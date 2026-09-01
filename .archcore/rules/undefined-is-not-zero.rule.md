---
title: A missing metric is undefined, never zero
type: rule
status: proposed
date: 20260901
source: AGENTS.md provider adapter boundaries; finding F5
tags: [cost, safety]
promoted_by: skill-ai-it promote
---

# A missing metric is undefined, never zero

**Rule.** A metric the source does not expose is `undefined`. Zero means the source explicitly reported zero. Never synthesize a missing metric, and never fall back to another models or providers
rates. A model absent from the pricing table yields no cost, not a guessed cost.

**Why.** Zero and unknown are different claims, and a user cannot tell them apart on screen. Upstream conflates them: both cost implementations fall back to Sonnet pricing for any unrecognized model,
so a Codex or Hermes session would display a confident, wrong, Anthropic-priced number.

**How to verify.** Optional metric fields are never defaulted at any layer, including display. The `cost` capability flag is false where the provider exposes no usage, and the panel is absent rather
than showing zero.
