#!/usr/bin/env python3
"""Build sanitized OpenAI Codex fixtures for the adapter regression suite.

Codex rollouts are large — the sources here run from 12 MB to 45 MB — so a fixture is a contiguous prefix that runs from the
real session start through the first record exhibiting the category, plus a tail. Contiguity matters for the same reason it
did for Claude: `call_id` correlates a function call with its output, and a detached window orphans both halves.

Sanitization mirrors scripts/make-fixtures.py: redact, then re-read the written file and fail on anything that should not
have survived. Codex rollouts embed the full system prompt and absolute workspace paths, so this is not optional.

Usage:
    python3 scripts/make-codex-fixtures.py
    python3 scripts/make-codex-fixtures.py --verify-only
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "tests" / "fixtures" / "codex"
HOME = str(Path.home())
USER = Path.home().name
SESSIONS = Path(os.environ.get("CODEX_HOME") or (Path.home() / ".codex")) / "sessions"

# Chosen on 20260901 by scanning the largest 60 rollouts for each predicate. Re-select if the local store changes.
SOURCES: dict[str, tuple[str, re.Pattern[str], int]] = {
    "01-session-basics": (
        "2026/08/31/rollout-2026-08-31T19-26-20-01a05724-1ec2-7022-aede-69704ff895a3.jsonl",
        re.compile(r'"type":"agent_message"'), 60),
    "02-exec-success": (
        "2026/08/31/rollout-2026-08-31T19-26-20-01a05724-1ec2-7022-aede-69704ff895a3.jsonl",
        re.compile(r'"exit_code":0'), 80),
    "03-exec-failure": (
        "2026/08/31/rollout-2026-08-31T19-26-20-01a05724-1ec2-7022-aede-69704ff895a3.jsonl",
        re.compile(r'"exit_code":[1-9]'), 120),
    "04-patch-apply": (
        "2026/06/11/rollout-2026-06-11T19-11-39-019eb5f3-917a-7ec1-a6cd-2d70fe9892d4.jsonl",
        re.compile(r'"patch_apply_end"'), 120),
    "05-mcp-call": (
        "2026/03/12/rollout-2026-03-12T23-00-15-019ce1eb-3a9b-7b02-9baa-4ddef68857b1.jsonl",
        re.compile(r'"name":"mcp'), 120),
    "06-reasoning": (
        "2026/03/12/rollout-2026-03-12T23-00-15-019ce1eb-3a9b-7b02-9baa-4ddef68857b1.jsonl",
        re.compile(r'"type":"reasoning"'), 60),
    "07-token-usage": (
        "2026/08/31/rollout-2026-08-31T19-26-20-01a05724-1ec2-7022-aede-69704ff895a3.jsonl",
        re.compile(r'"total_token_usage"'), 60),
}

TAIL = 20
STRING_CAP = 4_000

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
    # Workspace roots leak the operator's directory layout even after the home path is replaced.
    (re.compile(r"/Volumes/Data/_ai[A-Za-z0-9_./-]*"), "/workspace/project"),
    (re.compile(r"/Volumes/[A-Za-z0-9_.-]+"), "/workspace"),
]

FORBIDDEN: list[tuple[str, re.Pattern[str]]] = [
    ("home directory", re.compile(re.escape(HOME))),
    ("operator username", re.compile(re.escape(USER))),
    ("employer domain", re.compile(r"apn\.net\.au")),
    ("workspace root", re.compile(r"/Volumes/")),
    ("api token", re.compile(r"\b(sk|pk|gh[pousr]|xox[baprs])[-_][A-Za-z0-9_\-]{16,}")),
    ("aws key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.")),
    ("private key", re.compile(r"BEGIN [A-Z ]*PRIVATE KEY")),
]


def redact(text: str) -> str:
    for pattern, replacement in REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


def cap(node, limit: int):
    if isinstance(node, dict):
        return {k: cap(v, limit) for k, v in node.items()}
    if isinstance(node, list):
        return [cap(v, limit) for v in node]
    if isinstance(node, str) and len(node) > limit:
        return node[:limit] + f"\n[truncated for fixture, original length {len(node)}]"
    return node


def dump(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def build(slug: str, rel: str, anchor: re.Pattern[str], keep: int) -> Path:
    src = SESSIONS / rel
    if not src.is_file():
        raise SystemExit(f"source rollout missing for {slug}: {src}")

    parsed: list[tuple[str, dict]] = []
    hit: int | None = None
    # Streamed, not read whole: these files reach 45 MB and holding one costs more than the fixture is worth.
    with src.open(encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            parsed.append((line, record))
            if hit is None and anchor.search(line):
                hit = len(parsed) - 1
            if hit is not None and len(parsed) >= max(hit + TAIL, keep):
                break

    if hit is None:
        raise SystemExit(f"{slug}: source {rel} contains no record matching its anchor — pick another source")

    body = "\n".join(redact(dump(cap(record, STRING_CAP))) for _, record in parsed) + "\n"
    target = OUT / f"{slug}.jsonl"
    target.write_text(body, encoding="utf-8")
    return target


def synthesize() -> list[Path]:
    """The failure modes a healthy rollout store does not contain."""
    meta = {"timestamp": "2026-09-01T00:00:00.000Z", "type": "session_meta",
            "payload": {"id": "00000000-0000-4000-8000-000000000001", "timestamp": "2026-09-01T00:00:00.000Z",
                        "cwd": "/workspace/project", "originator": "codex_cli", "cli_version": "0.0.0",
                        "source": "cli", "model_provider": "openai"}}
    msg = {"timestamp": "2026-09-01T00:00:01.000Z", "type": "event_msg",
           "payload": {"type": "agent_message", "message": "done"}}

    written = []
    p = OUT / "08-malformed-line.jsonl"
    p.write_text(dump(meta) + "\n" + '{"type":"event_msg","payload":{ NOT JSON\n' + dump(msg) + "\n", encoding="utf-8")
    written.append(p)

    # A rollout read while Codex is mid-write ends on a partial record. No trailing newline: that is the point.
    p = OUT / "09-truncated-final-line.jsonl"
    p.write_text(dump(meta) + "\n" + dump(msg)[: len(dump(msg)) // 2], encoding="utf-8")
    written.append(p)
    return written


def verify() -> int:
    problems = 0
    for path in sorted(OUT.rglob("*.jsonl")):
        text = path.read_text(encoding="utf-8")
        for label, pattern in FORBIDDEN:
            match = pattern.search(text)
            if match:
                print(f"  LEAK {path.name}: {label} at offset {match.start()}", file=sys.stderr)
                problems += 1
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    if not args.verify_only:
        for slug, (rel, anchor, keep) in SOURCES.items():
            path = build(slug, rel, anchor, keep)
            print(f"  harvested {path.name} ({path.stat().st_size / 1024:.0f} KB)")
        for path in synthesize():
            print(f"  synthesized {path.name} ({path.stat().st_size} B)")

    problems = verify()
    total = len(list(OUT.rglob("*.jsonl")))
    if problems:
        print(f"\nFAIL — {problems} leak(s) across {total} fixtures", file=sys.stderr)
        return 1
    print(f"\nOK — {total} Codex fixtures, no forbidden pattern found")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
