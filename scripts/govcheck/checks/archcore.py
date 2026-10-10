"""Archcore documents: frontmatter, supersession chains, and no resolved finding asserted open."""

from __future__ import annotations

import re

from ..core import counted, fail
from ..config import (
    HISTORICAL_BANNER,
    ROOT,
)
from ..helpers import (
    _roadmap_completed_milestones,
    _roadmap_resolved_findings,
    without_code,
)

def check_archcore_frontmatter() -> None:
    """Every Archcore document declares a valid lifecycle state, and an accepted one records when.

    Archcore documents sit at the top of the source-priority order in AI_NAVIGATION.md, so a document whose state cannot
    be read is a document whose authority cannot be judged. An accepted document with no acceptance date is the specific
    failure this catches: it reads as authoritative while nothing records when it became so, which is exactly what a
    later reader needs in order to tell it apart from a draft someone forgot to finish.

    Rule: .archcore/README.md, "How to propose another" and the status-of-the-set section.
    """
    states = {"proposed", "accepted", "superseded", "rejected"}
    base = ROOT / ".archcore"
    if not base.is_dir():
        return
    for path in sorted(base.rglob("*.md")):
        if path.name == "README.md":
            continue
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        counted()
        if not text.startswith("---"):
            fail("archcore", f"{rel} has no YAML frontmatter")
            continue
        head = text.split("---", 2)[1]
        fields = dict(
            (line.split(":", 1)[0].strip(), line.split(":", 1)[1].strip())
            for line in head.splitlines()
            if ":" in line
        )
        state = fields.get("status")
        if state not in states:
            fail("archcore", f"{rel} declares status {state!r}, not one of {sorted(states)}")
        if state == "accepted" and not fields.get("accepted"):
            fail("archcore", f"{rel} is accepted but records no `accepted:` date")
        if not fields.get("source"):
            fail("archcore", f"{rel} has no `source:` provenance header")


def check_supersession_chain() -> None:
    """A superseded document names its replacement, and the replacement names it back.

    Supersession is where a document set rots quietly. A document marked superseded with no pointer leaves the reader
    with no way to find what replaced it, and a replacement that does not name what it replaced lets both documents sit
    in the index looking equally current. Either half alone is worse than neither, because it reads as maintained.

    Rule: .archcore/README.md, "How to propose another" and the adr supersession convention.
    """
    base = ROOT / ".archcore"
    if not base.is_dir():
        return

    front: dict[str, dict[str, str]] = {}
    for path in sorted(base.rglob("*.md")):
        if path.name == "README.md":
            continue
        text = path.read_text(encoding="utf-8")
        if not text.startswith("---"):
            continue
        head = text.split("---", 2)[1]
        front[path.name] = dict(
            (line.split(":", 1)[0].strip(), line.split(":", 1)[1].strip())
            for line in head.splitlines()
            if ":" in line
        )

    for name, fields in front.items():
        if fields.get("status") == "superseded":
            counted()
            successor = fields.get("superseded_by")
            if not successor:
                fail("archcore", f".archcore/**/{name} is superseded but names no superseded_by")
            elif successor not in front:
                fail("archcore", f".archcore/**/{name} names superseded_by {successor}, which does not exist")
            elif front[successor].get("supersedes") != name:
                fail("archcore", f"{successor} does not name {name} in its supersedes field — the chain points one way only")

        if "supersedes" in fields:
            counted()
            target = fields["supersedes"]
            if target not in front:
                fail("archcore", f".archcore/**/{name} supersedes {target}, which does not exist")
            elif front[target].get("status") != "superseded":
                fail("archcore", f"{target} is superseded by {name} but is not marked status: superseded")


def check_no_resolved_finding_asserted_open() -> None:
    """No live surface claims a finding is open that ROADMAP records as cleared.

    THE CLASS THIS CATCHES. Every other check here compares a claim to ground truth. This one compares a claim to
    ANOTHER CLAIM, which is the class an audit structurally misses: prose asserting "the test gate fails until F1 is
    resolved" has no file to check against, so it survives every path, count and catalog check and goes on instructing
    readers long after it stopped being true.

    Found on 20260901 in three places at once, one of them an ACCEPTED archcore guide that outranks AGENTS.md in the
    source-priority order, and one of them a ROADMAP fix that had silently no-opped because it anchored on table text
    the formatter had already padded.

    Rule: ROADMAP.md is the completion surface. A document that disagrees with it about whether work is done is wrong
    unless it declares itself dated evidence.
    """
    resolved = _roadmap_resolved_findings()
    completed = _roadmap_completed_milestones()
    if not resolved and not completed:
        return

    open_claim = [re.compile(p, re.I) for p in (
        r"until finding (F\d+) is resolved",
        r"fails? until finding (F\d+)",
        r"blocked by (F\d+)",
        r"(F\d+) (?:is )?(?:still )?(?:open|unresolved|outstanding)",
    )]
    not_started = re.compile(r"\b(M\d+|Milestone \d+)\b[^.\n]{0,80}\bnot started\b", re.I)

    for surface in ROOT.rglob("*.md"):
        rel = surface.relative_to(ROOT).as_posix()
        if rel.startswith((".staleness-audit/", "node_modules/", ".ai-context/", "graphify-out/")):
            continue
        text = surface.read_text(encoding="utf-8", errors="replace")
        if HISTORICAL_BANNER in text:
            continue  # declares itself a record of what was true then
        counted()

        body = without_code(text)
        for pattern in open_claim:
            for match in pattern.finditer(body):
                finding = match.group(1).upper()
                if finding in resolved:
                    fail("staleness", f"{rel} says {finding} is open, but ROADMAP.md records it as cleared")

        for match in not_started.finditer(body):
            token = match.group(1).upper().replace("MILESTONE ", "M")
            if token in completed:
                fail("staleness", f"{rel} says {token} is not started, but ROADMAP.md ticks it complete")
