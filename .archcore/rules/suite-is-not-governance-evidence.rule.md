---
title: A passing suite is never evidence that governance is current
type: rule
status: accepted
date: 20260902
accepted: 20260902
source: the 20260901 staleness audit; operator direction 20260902
tags: [governance, checks, discipline]
promoted_by: skill-project-coherence
---

# A passing suite is never evidence that governance is current

**Rule.** Code correctness and documentation currency are separate control planes. A green test run and a green governance check say nothing about whether `AGENTS.md`, `ARCHITECTURE.md`, `ROADMAP.md`
or an accepted `.archcore/` document still describes reality. Never cite one as evidence for the other, and never close a piece of work on the strength of a passing suite alone.

**Why this is a rule rather than a preference.** On 20260901 this project ran continuously green at 188 governance checks while:

- an **accepted** `.archcore/` guide — top of the source-priority order, above `AGENTS.md` — instructed readers that the `test` gate was expected to fail, hours after it had started passing;
- `AGENTS.md` carried the same instruction as live agent policy;
- an accepted plan read "not started" for work completed in three commits;
- `ARCHITECTURE.md` named no adapter at all, in a fork whose entire purpose is adapters.

Every path in those documents resolved. Every count was right. Every catalog was complete. The suite had nothing to say, because a consistency check validates that copies match and has no opinion
about whether the original is still true.

**The failure mode is specific and worth naming.** Because `.archcore/` outranks `AGENTS.md` in the source-priority order, a stale accepted document does not merely misinform — it *outranks* the
correct information elsewhere in the repo. An agent following the stated authority order arrives at the wrong instruction first.

**How to comply.**

- Treat a green suite as the null hypothesis of a review, not its conclusion. The question is always "would a careful reader be misled", not "does it pass".
- Where a document asserts project state, the completion surface is `ROADMAP.md`. `check_no_resolved_finding_asserted_open` compares the two and fails on disagreement; a document that means to record
  history declares itself dated evidence and is exempt.
- Run a staleness audit when nothing specific has changed but time has passed. Its findings are, by construction, the ones the suite cannot see.

**What this rule does not claim.** It does not say the checks are worthless — they caught the forward reference that this very rule's routing entry created, minutes before it existed. It says they
measure a different thing.
