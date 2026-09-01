#!/usr/bin/env python3
"""Build sanitized Claude Code fixtures for the parser regression suite.

Harvests real local transcripts for the twelve categories that occur naturally, synthesizes the three failure modes that a
healthy store never contains, and writes everything to tests/fixtures/claude/.

SANITIZATION IS THE POINT. These files are committed to a public fork, so anything that could identify the operator, their
employer, their machine, or a credential must not survive. The redaction runs over the serialized JSON of every record,
then a verification pass re-reads the written file and fails the run if any forbidden pattern remains. A sanitizer whose
output is never checked is a sanitizer nobody can trust.

What is deliberately PRESERVED: record structure, type fields, tool names, uuid linkage, timestamps, token counts, error
flags. Those are what the parser reads, so replacing them would make the fixtures test something other than the product.

Usage:
    python3 scripts/make-fixtures.py                 # build all fixtures
    python3 scripts/make-fixtures.py --verify-only   # re-check existing fixtures, write nothing
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "tests" / "fixtures" / "claude"
HOME = str(Path.home())
USER = Path.home().name

# Source transcripts, one per naturally-occurring category. Chosen from a fixture-scan run on 20260901; re-run
# `just fixture-scan` and update these if the local store changes.
# What makes each category what it claims to be. The builder anchors its window on the first record matching
# this, so a fixture cannot be harvested that lacks its own defining feature. tests/fixtures.test.ts asserts the
# same properties on the written files, which is what catches a re-harvest that drifts.
ANCHORS: dict[str, re.Pattern[str]] = {
    "02-bash-success": re.compile(r'"name":"Bash"'),
    "03-bash-failure": re.compile(r'"is_error":true'),
    "04-read-write-edit": re.compile(r'"name":"(Read|Write|Edit|MultiEdit)"'),
    "05-multi-tool": re.compile(r'"name":"[A-Z]'),
    "07-retry-loop": re.compile(r'"name":"[A-Z]'),
    "08-token-cost": re.compile(r'"input_tokens"'),
    "09-compaction": re.compile(r'isCompactSummary|compactMetadata|compact_boundary'),
    "12-large-tool-output": re.compile(r'.{40000}'),
    "13-unicode-path-or-content": re.compile(r'[^\x00-\x7F]'),
    "15-cancelled-interrupted": re.compile(r'interrupted by user|aborted|cancel', re.I),
}

SOURCES: dict[str, tuple[str, int]] = {
    # category slug: (path, max records to keep)
    "01-simple-prompt-response": ("-Users-malik-ahmad/08dc8929-2531-44f7-869d-c31209b7fae0.jsonl", 12),
    "02-bash-success": ("-Users-malik-ahmad/1d15947b-8d37-40f5-af20-f0c6573e3c15.jsonl", 20),
    "03-bash-failure": ("-Users-malik-ahmad/3306d8ac-004d-42c7-be40-333fa53047d0.jsonl", 45),
    "04-read-write-edit": ("-Users-malik-ahmad/57dd5a44-b5b0-4aff-805f-80ed898698c7.jsonl", 40),
    "05-multi-tool": ("-Volumes-Data--ai--tool-tools-stuff-openbb/90dee693-1e00-4f8d-b2ad-8e59ff113f1b.jsonl", 120),
    "07-retry-loop": ("-Users-malik-ahmad/45300e7a-9848-4af1-aa72-e88a1ac7bf91.jsonl", 180),
    "08-token-cost": ("-Users-malik-ahmad/03daf931-a652-4870-98d0-97aaee4df9c3.jsonl", 12),
    "09-compaction": ("-Volumes-Data--product-product-stuff-podbng-lab/aa97bfac-1499-4715-88d4-d7c66aec6690.jsonl", 40),
    "12-large-tool-output": ("-Users-malik-ahmad--claude-mem-observer-sessions/0050cb3f-f0a9-4028-9d22-035974d075df.jsonl", 40),
    "13-unicode-path-or-content": ("-Users-malik-ahmad/0d97dd68-f667-47e3-a5c1-baeab8b04500.jsonl", 30),
    "15-cancelled-interrupted": ("-Users-malik-ahmad/3306d8ac-004d-42c7-be40-333fa53047d0.jsonl", 45),
}

PROJECTS = Path(os.environ.get("CLAUDE_CONFIG_DIR") or (Path.home() / ".claude")) / "projects"

# Category 12 must stay genuinely large or it stops testing the large path, but 1.2 MB in git is wasteful.
# 120 KB still exercises every size branch the parser has.
LARGE_CAP = 120_000
NORMAL_CAP = 8_000

# Records kept after the anchor, so the fixture shows what happened next rather than ending on the anchor itself.
TAIL_AFTER_ANCHOR = 15

# Ordered: earlier patterns win, so the specific credential shapes run before the generic path rewrite.
REDACTIONS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(sk|pk|gh[pousr]|xox[baprs])[-_][A-Za-z0-9_\-]{16,}"), "REDACTED_TOKEN"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "REDACTED_AWS_KEY"),
    (re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}"), "REDACTED_JWT"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"), "REDACTED_PRIVATE_KEY"),
    (re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"), "user@example.com"),
    (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "203.0.113.1"),
    (re.compile(re.escape(HOME)), "/Users/testuser"),
    (re.compile(re.escape(USER)), "testuser"),
    (re.compile(r"\bapn\.net\.au\b"), "example.com"),
]

# Re-checked against the WRITTEN file. Anything matching here means sanitization did not hold.
FORBIDDEN: list[tuple[str, re.Pattern[str]]] = [
    ("home directory", re.compile(re.escape(HOME))),
    ("operator username", re.compile(re.escape(USER))),
    ("employer domain", re.compile(r"apn\.net\.au")),
    ("api token", re.compile(r"\b(sk|pk|gh[pousr]|xox[baprs])[-_][A-Za-z0-9_\-]{16,}")),
    ("aws key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.")),
    ("private key", re.compile(r"BEGIN [A-Z ]*PRIVATE KEY")),
]


def redact(text: str) -> str:
    for pattern, replacement in REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


def cap_strings(node, limit: int):
    """Truncate long strings in place, marking the cut so a reader knows the record was shortened."""
    if isinstance(node, dict):
        return {k: cap_strings(v, limit) for k, v in node.items()}
    if isinstance(node, list):
        return [cap_strings(v, limit) for v in node]
    if isinstance(node, str) and len(node) > limit:
        return node[:limit] + f"\n[truncated for fixture, original length {len(node)}]"
    return node


def build(slug: str, rel: str, keep: int) -> Path:
    src = PROJECTS / rel
    if not src.is_file():
        raise SystemExit(f"source transcript missing for {slug}: {src}")
    limit = LARGE_CAP if "large" in slug else NORMAL_CAP

    parsed = []
    for line in src.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            parsed.append((line, json.loads(line)))
        except json.JSONDecodeError:
            continue

    # A session is a CHAIN: every record links to its parent by uuid, and buildSession pairs a tool_use with
    # the tool_result that follows it. Taking a head plus a detached middle window breaks both, and the parser
    # then reports a handful of orphaned steps from a large file — which would pin damaged behaviour as the
    # parity baseline. Keep a CONTIGUOUS prefix that runs from the real session start through the anchor.
    anchor = ANCHORS.get(slug)
    if anchor is not None:
        hit = next((i for i, (raw, _) in enumerate(parsed) if anchor.search(raw)), None)
        if hit is None:
            raise SystemExit(f"{slug}: source {rel} contains no record matching its anchor — pick another source")
        # The anchor guarantees the defining feature is present; `keep` guarantees enough session to be
        # representative. Take whichever is longer, or a fixture whose feature appears in record 3 ends
        # up three records long and exercises almost nothing.
        parsed = parsed[: max(hit + TAIL_AFTER_ANCHOR, keep)]
    else:
        parsed = parsed[:keep]

    records = [cap_strings(record, limit) for _, record in parsed]
    # redact() must wrap the serialized record. Dropping it here once produced fixtures that passed every
    # structural assertion while carrying the operator home path; the verification pass is what caught it.
    body = "\n".join(redact(json.dumps(r, ensure_ascii=False, separators=(",", ":"))) for r in records) + "\n"
    target = OUT / f"{slug}.jsonl"
    target.write_text(body, encoding="utf-8")
    return target



# Claude stores a subagent as a SIBLING FILE, at <projectDir>/<sessionId>/subagents/<agent>.jsonl, not as records
# inline in the parent transcript. A single-file fixture therefore cannot represent one, and the scan across this
# store found no session with a meaningful number of inline sidechain records to substitute. Fixture 06 is built
# as the real directory layout so parseSubagents has something to read and parentSessionId linkage can be tested.
SUBAGENT_SESSION = "-Volumes-Data--product-product-stuff-podbng-lab/aa97bfac-1499-4715-88d4-d7c66aec6690"


def build_subagent_fixture(keep: int = 60) -> list[Path]:
    src_session = PROJECTS / f"{SUBAGENT_SESSION}.jsonl"
    src_subagents = PROJECTS / SUBAGENT_SESSION / "subagents"
    if not src_session.is_file() or not src_subagents.is_dir():
        raise SystemExit("subagent source layout missing; re-run the directory search in scripts/make-fixtures.py")

    root = OUT / "06-subagent"
    (root / "session" / "subagents").mkdir(parents=True, exist_ok=True)
    written = []

    def copy(src: Path, dst: Path, limit: int, cap: int) -> Path:
        records = []
        for line in src.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                records.append(cap_strings(json.loads(line), cap))
            except json.JSONDecodeError:
                continue
            if len(records) >= limit:
                break
        dst.write_text("\n".join(redact(dump(r)) for r in records) + "\n", encoding="utf-8")
        return dst

    written.append(copy(src_session, root / "session.jsonl", keep, NORMAL_CAP))
    for agent in sorted(src_subagents.glob("*.jsonl"))[:2]:
        written.append(copy(agent, root / "session" / "subagents" / agent.name, 40, NORMAL_CAP))
    return written


def dump(obj) -> str:
    """Serialize compactly, the way the real transcripts are written."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def synthesize() -> list[Path]:
    """The three failure modes a healthy transcript store never contains.

    These are hand-built rather than harvested, and the fixture-scan reports them as SYN rather than GAP for that reason.
    A scan of 1,018,178 real lines on 20260901 found zero undecodable ones, so without these the malformed-input paths
    would never be exercised at all.
    """
    written = []
    base = {
        "parentUuid": None, "isSidechain": False, "userType": "external", "cwd": "/Users/testuser/project",
        "sessionId": "00000000-0000-4000-8000-000000000001", "version": "2.0.0", "gitBranch": "main",
        "type": "user", "uuid": "00000000-0000-4000-8000-00000000000a", "timestamp": "2026-09-01T00:00:00.000Z",
        "message": {"role": "user", "content": "hello"},
    }
    assistant = dict(base, type="assistant", uuid="00000000-0000-4000-8000-00000000000b",
                     parentUuid=base["uuid"],
                     message={"role": "assistant", "model": "claude-sonnet-4-5-20250929",
                              "content": [{"type": "text", "text": "hi"}],
                              "usage": {"input_tokens": 10, "output_tokens": 3,
                                        "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}})

    # 10 — a corrupt line in the middle. The parser must skip it and keep the surrounding records.
    p = OUT / "10-malformed-line.jsonl"
    p.write_text(dump(base) + "\n" + '{"type":"assistant","message":{ THIS IS NOT JSON\n'
                 + dump(assistant) + "\n", encoding="utf-8")
    written.append(p)

    # 11 — the last line cut mid-write, which is what a live session looks like when read at the wrong moment.
    # No trailing newline: the truncation is the point.
    p = OUT / "11-truncated-final-line.jsonl"
    truncated = dump(assistant)[: len(dump(assistant)) // 2]
    p.write_text(dump(base) + "\n" + truncated, encoding="utf-8")
    written.append(p)

    # 14 — a workspace reached through a symlink. The cwd differs from the realpath, so anything keying a session to a
    # project by string comparison of cwd will mis-group it.
    p = OUT / "14-symlinked-workspace.jsonl"
    linked = dict(base, cwd="/Users/testuser/link-to-project")
    linked_assistant = dict(assistant, cwd="/Users/testuser/link-to-project")
    p.write_text(dump(linked) + "\n" + dump(linked_assistant) + "\n", encoding="utf-8")
    written.append(p)
    return written


def verify() -> int:
    """Re-read every written fixture and fail on any pattern that should not have survived."""
    problems = 0
    for path in sorted(OUT.rglob("*.jsonl")):
        text = path.read_text(encoding="utf-8")
        for label, pattern in FORBIDDEN:
            match = pattern.search(text)
            if match:
                # Never print the match itself; that would put the secret in a log.
                print(f"  LEAK {path.name}: {label} at offset {match.start()}", file=sys.stderr)
                problems += 1
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--verify-only", action="store_true", help="re-check existing fixtures, write nothing")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)

    if not args.verify_only:
        for slug, (rel, keep) in SOURCES.items():
            path = build(slug, rel, keep)
            print(f"  harvested {path.name} ({path.stat().st_size / 1024:.0f} KB)")
        for path in build_subagent_fixture():
            print(f"  harvested {path.relative_to(OUT)} ({path.stat().st_size / 1024:.0f} KB)")
        for path in synthesize():
            print(f"  synthesized {path.name} ({path.stat().st_size} B)")

    problems = verify()
    total = len(list(OUT.rglob("*.jsonl")))
    if problems:
        print(f"\nFAIL — {problems} leak(s) across {total} fixtures", file=sys.stderr)
        return 1
    print(f"\nOK — {total} fixtures, no forbidden pattern found")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
