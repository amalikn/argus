---
title: Named anti-patterns
type: rule
status: proposed
date: 20260901
source: CONVENTIONS.md anti-patterns table
tags: [governance]
promoted_by: skill-ai-it promote
---

# Named anti-patterns

**Rule.** The following are defects in this repository, not stylistic preferences.

| Pattern | Why it is wrong |
|---|---|
| A provider conditional in UI or analysis code | See [rule 0004](no-provider-conditionals-downstream.rule.md) |
| Defaulting a missing token count or cost to zero | Presents an unknown as a measurement; see [rule 0003](undefined-is-not-zero.rule.md) |
| Falling back to another models rates when a model is unrecognized | Produces a confident wrong number |
| Reading a whole transcript into memory | Codex rollouts reach hundreds of megabytes; the parser already streams |
| Writing exports or caches into a scanned provider directory | The next discovery pass ingests them as sessions that never ran |
| Broadening a governance check to make a run green | See [rule 0006](fix-the-project-not-the-check.rule.md) |
| Adding a settings key nothing reads | Upstream ships two such keys; they appear in the settings UI and do nothing |

**Why.** Each entry was observed in the upstream code or would have been introduced during the fork. Naming them makes them reviewable rather than rediscovered.
