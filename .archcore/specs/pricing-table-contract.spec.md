---
title: Vendored pricing table contract
type: spec
status: accepted
date: 20260901
accepted: 20260901
source: current-state-audit.md pricing section; scripts/refresh-pricing.mjs
tags: [contract, cost]
promoted_by: skill-ai-it promote
---

# Vendored pricing table contract

## Shape

`src/pricing/model-pricing.json`, written only by `scripts/refresh-pricing.mjs`:

| Field | Meaning |
|---|---|
| `schemaVersion` | Contract version of this file |
| `source` | `{url, repo, license, etag}` of the upstream dataset |
| `retrievedAt` | ISO timestamp of the fetch |
| `upstreamSha256` | Hash of the upstream body, used by `--check` for drift detection |
| `modelCount` | Number of models retained |
| `models` | Map of model id to rate record |

Per model: `inputCostPerToken`, `outputCostPerToken`, `provider`, optional `cacheReadCostPerToken`, optional `cacheWriteCostPerToken` with `cacheWriteCostIsExplicit`, optional `maxInputTokens`,
optional `tiers`.

## Invariants

- A model with no published input or output price is ABSENT from the map. Absence means unknown; it must never be represented as zero.
- `cacheWriteCostPerToken` appears only when the publisher publishes it, always paired with `cacheWriteCostIsExplicit: true`. A derived cache-write price wearing the same field name as a real one is
  worse than no number.
- Tiered overrides are retained verbatim under `tiers`, because which tier applies depends on per-turn context size that only the parser knows.
- Nothing reads this file over the network at runtime.

## Enforcement

`scripts/check_governance.py` registers the file as DERIVED from its generator, so a hand-edit is visible. `just pricing-check` compares `upstreamSha256` and reports added, removed and repriced models.
