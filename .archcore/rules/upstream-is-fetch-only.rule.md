---
title: Upstream is fetch-only
type: rule
status: accepted
date: 20260901
accepted: 20260901
source: AGENTS.md fork discipline
tags: [fork, safety]
promoted_by: skill-ai-it promote
---

# Upstream is fetch-only

**Rule.** The `upstream` remote points at `yessGlory17/argus` for fetching only. Its push URL is set to `DISABLED_read_only_upstream`. Do not restore it, and do not add a second remote that reaches
upstream.

**Why.** A push to upstream from this fork is not recoverable by a revert: it lands in someone elses repository and in every clone taken meanwhile. The protection used to be structural — no `origin`
existed — and that protection disappeared the moment the fork was added, so it was replaced with an explicit one.

**How to verify.** `git remote -v` shows `upstream` with a fetch URL and a disabled push URL. `just upstream-log` still works, which proves fetching is unaffected.
