"""The checker's own shape (skill-ai-it patterns/governance-checks.md, "Structure and growth"): small modules, small checks, one-way imports, the shared engine."""

from __future__ import annotations

import ast
from pathlib import Path

from ..config import CHECKER_PACKAGE, CHECK_MAX_LINES, CORE_TEMPLATE, MODULE_MAX_LINES, OVERSIZE, ROOT
from ..core import counted, fail


def check_govcheck_structure() -> None:
    """The checker stays small and coherent as it grows.

    Catches: a family module over MODULE_MAX_LINES, a check over CHECK_MAX_LINES (except the recorded OVERSIZE entries, which may shrink but
    never grow), a family importing another family, and a core.py that differs from the skill-ai-it template. Why: one 1,820-line file cost
    about 26,000 tokens to read before a check could be added (operator, 2026-10-10: "doesn't go crazy indefinitely").
    """
    pkg = ROOT / CHECKER_PACKAGE
    families = {p.stem for p in (pkg / "checks").glob("*.py") if p.stem != "__init__"}
    for path in sorted(pkg.rglob("*.py")):
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        counted()
        if path.name != "__init__.py" and text.count("\n") > MODULE_MAX_LINES:
            fail("structure", f"{rel}: {text.count(chr(10))} lines, over {MODULE_MAX_LINES}; split the family")
        tree = ast.parse(text)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and path.parent.name == "checks" and path.name != "__init__.py" and node.level == 1:
                # Both forms: `from .other import x` and `from . import other`.
                for name in ([node.module] if node.module else [a.name for a in node.names]):
                    counted()
                    if name in families:
                        fail("structure", f"{rel}: imports family `{name}`; share code through helpers.py instead")
        for node in tree.body:
            if isinstance(node, ast.FunctionDef) and node.name.startswith("check_"):
                size = node.end_lineno - node.lineno + 1
                limit = OVERSIZE.get(node.name, CHECK_MAX_LINES)
                counted()
                if size > limit:
                    fail("structure", f"{rel}: {node.name} is {size} lines, over {limit}; split it (OVERSIZE entries may only shrink)")
    canonical = Path(CORE_TEMPLATE)
    if canonical.is_file():
        counted()
        if canonical.read_text(encoding="utf-8") != (pkg / "core.py").read_text(encoding="utf-8"):
            fail("structure", f"{CHECKER_PACKAGE}/core.py differs from {CORE_TEMPLATE}; copy the template (core holds no project code)")
