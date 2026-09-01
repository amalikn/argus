#!/usr/bin/env python3
"""Classify agent session transcripts against the 15 Claude fixture categories in the implementation plan (section 9).

Reports which categories real local transcripts can source and which must be synthesized. Prints counts and file paths only — never
transcript content — so it is safe to run and paste output from.

Usage:
    python3 scripts/fixture-scan.py                       # scan ~/.claude/projects (or $CLAUDE_CONFIG_DIR)
    python3 scripts/fixture-scan.py --root PATH           # scan an explicit projects root
    python3 scripts/fixture-scan.py --candidates 6        # keep more candidates per category
    python3 scripts/fixture-scan.py --json out.json       # also write machine-readable results

Re-run after capturing fixtures to confirm coverage has not regressed.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

CATEGORIES = [
    "01-simple-prompt-response",
    "02-bash-success",
    "03-bash-failure",
    "04-read-write-edit",
    "05-multi-tool",
    "06-subagent",
    "07-retry-loop",
    "08-token-cost",
    "09-compaction",
    "10-malformed-line",
    "11-truncated-final-line",
    "12-large-tool-output",
    "13-unicode-path-or-content",
    "14-symlinked-workspace",
    "15-cancelled-interrupted",
]

# Categories that a healthy transcript store is not expected to contain. These are failure-mode fixtures and are normally
# synthesized by hand rather than harvested, so an empty result for them is expected rather than a problem.
EXPECTED_SYNTHETIC = {"10-malformed-line", "11-truncated-final-line", "14-symlinked-workspace"}

TOOL_NAMES = ("Bash", "Read", "Write", "Edit", "MultiEdit", "WebFetch", "Task", "Glob", "Grep")
TOOL_RE = re.compile(r'"name"\s*:\s*"(' + "|".join(TOOL_NAMES) + r')"')
ERROR_RE = re.compile(r'"is_error"\s*:\s*true')
CANCEL_RE = re.compile(r'interrupted by user|request was aborted|user_cancel|"stop_reason":\s*"cancel', re.I)
COMPACT_RE = re.compile(r"isCompactSummary|compactMetadata|compact_boundary")

LARGE_RECORD_BYTES = 100_000


def default_root() -> Path:
    base = os.environ.get("CLAUDE_CONFIG_DIR") or (Path.home() / ".claude")
    return Path(base) / "projects"


def classify(path: Path, hits: dict, stats: dict, keep: int) -> None:
    """Classify one session file, appending its path to every category it satisfies."""
    try:
        raw = path.read_bytes()
    except OSError as err:
        stats["unreadable"] += 1
        print("  ! unreadable: %s (%s)" % (path, err), file=sys.stderr)
        return

    stats["bytes"] += len(raw)
    lines = raw.decode("utf-8", errors="replace").split("\n")

    saw: set[str] = set()
    tools: set[str] = set()
    tool_sequence: list[str] = []
    last_line_bad = False
    n_lines = 0

    for index, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
        n_lines += 1
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            stats["bad_lines"] += 1
            saw.add("10-malformed-line")
            # A bad line at the very end of the file is the live-write truncation case, not general corruption.
            last_line_bad = index >= len(lines) - 2
            continue
        last_line_bad = False
        if not isinstance(record, dict):
            continue

        blob = json.dumps(record, ensure_ascii=False)
        if len(blob) > LARGE_RECORD_BYTES:
            saw.add("12-large-tool-output")
        if record.get("isSidechain") or '"Task"' in blob:
            saw.add("06-subagent")
        if '"usage"' in blob and ("input_tokens" in blob or "output_tokens" in blob):
            saw.add("08-token-cost")
        if COMPACT_RE.search(blob):
            saw.add("09-compaction")
        if CANCEL_RE.search(blob):
            saw.add("15-cancelled-interrupted")
        for match in TOOL_RE.finditer(blob):
            tools.add(match.group(1))
            tool_sequence.append(match.group(1))
        if ERROR_RE.search(blob) and "Bash" in tools:
            saw.add("03-bash-failure")
        for char in blob[:20_000]:
            if ord(char) > 127 and unicodedata.category(char)[0] in ("L", "S"):
                saw.add("13-unicode-path-or-content")
                break

    stats["lines"] += n_lines
    if last_line_bad:
        saw.add("11-truncated-final-line")
    if "Bash" in tools and "03-bash-failure" not in saw:
        saw.add("02-bash-success")
    if {"Read", "Write", "Edit"} <= tools or ({"Read", "Write"} & tools and "Edit" in tools):
        saw.add("04-read-write-edit")
    if len(tools) >= 3:
        saw.add("05-multi-tool")
    if not tools and n_lines >= 2:
        saw.add("01-simple-prompt-response")
    for i in range(len(tool_sequence) - 2):
        if tool_sequence[i] == tool_sequence[i + 1] == tool_sequence[i + 2]:
            saw.add("07-retry-loop")
            break
    if (path.parent / path.stem / "subagents").is_dir():
        stats["subagent_dirs"] += 1
        saw.add("06-subagent")
    if path.is_symlink() or path.parent.is_symlink():
        saw.add("14-symlinked-workspace")

    for category in saw:
        if len(hits[category]) < keep:
            hits[category].append({"path": str(path), "lines": n_lines, "bytes": len(raw)})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", type=Path, default=None, help="projects root to scan (default: $CLAUDE_CONFIG_DIR/projects or ~/.claude/projects)")
    parser.add_argument("--candidates", type=int, default=4, help="candidate files to retain per category (default: 4)")
    parser.add_argument("--json", type=Path, default=None, help="also write results as JSON to this path")
    args = parser.parse_args()

    root = args.root or default_root()
    if not root.is_dir():
        print("no projects root at %s" % root, file=sys.stderr)
        return 2

    hits: dict[str, list] = {c: [] for c in CATEGORIES}
    stats = {"sessions": 0, "lines": 0, "bad_lines": 0, "bytes": 0, "subagent_dirs": 0, "unreadable": 0}

    for project in sorted(p for p in root.iterdir() if p.is_dir()):
        for session in sorted(project.glob("*.jsonl")):
            stats["sessions"] += 1
            classify(session, hits, stats, args.candidates)

    print("root: %s" % root)
    print("scanned sessions: %d | lines: %d | undecodable lines: %d | unreadable files: %d" % (stats["sessions"], stats["lines"], stats["bad_lines"], stats["unreadable"]))
    print("total bytes: %.1f MB | sessions with subagents/ dir: %d" % (stats["bytes"] / 1e6, stats["subagent_dirs"]))
    print()

    gaps_unexpected = []
    for category in CATEGORIES:
        found = hits[category]
        if found:
            mark = "OK "
        elif category in EXPECTED_SYNTHETIC:
            mark = "SYN"
        else:
            mark = "GAP"
            gaps_unexpected.append(category)
        count = len(found) if len(found) < args.candidates else "%d+" % args.candidates
        print("%s %-30s candidates=%s" % (mark, category, count))
        for candidate in found[:2]:
            print("      %s  (%d lines, %.0f KB)" % (candidate["path"], candidate["lines"], candidate["bytes"] / 1024))

    print()
    print("legend: OK = sourceable from real transcripts | SYN = expected to be synthesized by hand | GAP = expected but missing")

    if args.json:
        args.json.write_text(json.dumps({"root": str(root), "stats": stats, "hits": hits}, indent=2), encoding="utf-8")
        print("wrote %s" % args.json)

    # An unexpected gap is worth a non-zero exit so this can gate a fixture-coverage check later.
    return 1 if gaps_unexpected else 0


if __name__ == "__main__":
    raise SystemExit(main())
