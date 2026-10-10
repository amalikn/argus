"""Engine of a project's governance checker: failure collection, assertion counting, the runner and its reporters. Stdlib only.

This file is identical in every governed project (canonical: skill-ai-it `templates/govcheck/core.py`; the standard is skill-ai-it
`patterns/governance-checks.md`, "Structure and growth"). Project knowledge never goes here: data lives in `config.py`, shared readers in
`helpers.py`, checks in `checks/<family>.py`. Imports point one way: checks -> helpers -> config -> core.

Run through the entry point: `python scripts/check_governance.py [--select FAMILY,...] [--json] [--timings]`. The default output is one line on
a pass and one line per failure, so an agent's tokens do not grow with the number of checks.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections.abc import Callable, Sequence

failures: list[str] = []
checks_run = 0


def fail(check: str, detail: str) -> None:
    """Record one defect.

    Args:
        check: the short name shown before the detail (by convention the check's subject, e.g. `path`, `docs-index`).
        detail: what is wrong and where, in one line.
    """
    failures.append(f"{check}: {detail}")


def counted() -> None:
    """Record one assertion actually evaluated. Call it per real comparison, never per function, so the total stays honest."""
    global checks_run
    checks_run += 1


def family_of(check: Callable[[], None]) -> str:
    """The family a check belongs to: the name of the module it is defined in.

    Args:
        check: a check function.

    Returns:
        The last part of its module name (`checks.paths` -> `paths`).
    """
    return check.__module__.rsplit(".", 1)[-1]


def run(checks: Sequence[Callable[[], None]], argv: list[str] | None = None) -> int:
    """Run the checks in order and report.

    Args:
        checks: the check functions, in the order they run (the project's `checks.CHECKS`).
        argv: command-line arguments without the program name; None reads sys.argv.

    Returns:
        0 when nothing failed, 1 otherwise.
    """
    ap = argparse.ArgumentParser(description="Governance coherence checks")
    ap.add_argument("--select", default="", help="comma-separated families to run (default: all)")
    ap.add_argument("--json", action="store_true", help="print a JSON report instead of text")
    ap.add_argument("--timings", action="store_true", help="also print seconds per family")
    args = ap.parse_args(argv)
    selected = {f.strip() for f in args.select.split(",") if f.strip()}
    timings: dict[str, float] = {}
    for check in checks:
        family = family_of(check)
        if selected and family not in selected:
            continue
        start = time.perf_counter()
        check()
        timings[family] = timings.get(family, 0.0) + time.perf_counter() - start
    unique = sorted(set(failures))
    if args.json:
        print(json.dumps({"ok": not unique, "checks_run": checks_run, "failures": unique,
                          "seconds": {k: round(v, 3) for k, v in sorted(timings.items())}}, indent=1))
        return 1 if unique else 0
    if unique:
        print(f"FAIL — {len(unique)} issue(s) across {checks_run} checks\n")
        for f in unique:
            print(f"  ✗ {f}")
    else:
        print(f"OK — {checks_run} governance checks passed")
    if args.timings:
        for family, secs in sorted(timings.items(), key=lambda kv: -kv[1]):
            print(f"  {secs:6.2f}s  {family}")
    return 1 if unique else 0


if __name__ == "__main__":
    sys.exit("run through scripts/check_governance.py")
