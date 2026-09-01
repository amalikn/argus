---
title: Refreshing and drift-checking the pricing table
type: guide
status: proposed
date: 20260901
source: current-state-audit.md pricing section
tags: [cost, process, tooling]
promoted_by: skill-ai-it promote
---

# Refreshing and drift-checking the pricing table

## When

Periodically, and whenever a cost figure is questioned. Never as part of a runtime code path.

## Procedure

1. `just pricing-check` — fetches the upstream dataset, compares `upstreamSha256` against the vendored file, and reports added, removed and repriced models. Exits non-zero when stale, so it can gate
   CI later.
2. If stale, `just pricing-refresh` — rewrites `src/pricing/model-pricing.json` with fresh data and fresh provenance.
3. Review the diff. A repriced model is a real pricing change and may invalidate cost figures already shown to a user in a saved export.
4. Commit the regenerated file together with any change to its generator. Separating them breaks reproducibility, since the file is only trustworthy alongside the code that produced it.

## Verification

The vendored file records `source`, `retrievedAt` and `upstreamSha256`. A stale table is therefore visible on inspection rather than silently wrong.
