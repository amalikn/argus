"""Constants and type mirrors restated across files stay in step."""

from __future__ import annotations

import re

from ..core import counted, fail
from ..config import (
    CONSTANT_SURFACES,
    ROOT,
    SCAN_SUFFIXES,
    SELF_FILES,
)
from ..helpers import (
    read,
    without_code,
)

def check_constant_sync() -> None:
    """Facts restated across surfaces stay identical, and no unregistered file restates them.

    Duplication here is deliberate: the operator must read the value at the point of decision without following a
    pointer. So the duplication stays and the sync is enforced. Orphan detection is the half that makes it self-extending.
    """
    for name, entry in CONSTANT_SURFACES.items():
        pattern = re.compile(str(entry["pattern"]))
        registered = {str(s) for s in entry["surfaces"]}  # type: ignore[union-attr]
        owner = str(entry.get("owner", ""))

        for surface in sorted(registered):
            text = read(surface)
            counted()
            if text is None:
                fail("constant", f"{name}: registered surface {surface} does not exist")
            elif not pattern.search(without_code(text)):
                fail("constant", f"{name}: {surface} is registered but no longer states it (owner: {owner or 'unset'})")

        for path in sorted(ROOT.rglob("*")):
            if not path.is_file() or path.suffix not in SCAN_SUFFIXES:
                continue
            rel = path.relative_to(ROOT).as_posix()
            if rel in registered or rel.startswith(".") or "/." in rel or rel in SELF_FILES:
                continue
            counted()
            if pattern.search(without_code(path.read_text(encoding="utf-8", errors="ignore"))):
                fail("constant", f"{name}: {rel} states it but is not registered in CONSTANT_SURFACES")


def check_capability_types_mirror() -> None:
    """The webview capability type mirrors the extension-side one, field for field.

    webview/src/types/session.ts declares SessionCapabilities by hand because the webview must not import the adapter
    contract. Nothing makes the two stay in step, so adding a capability on one side and forgetting the other produces
    a panel that renders from a flag the other side never sets - and it type-checks on both sides.

    Rule: CONVENTIONS.md, "Normalized types are discriminated unions"; ARCHITECTURE.md capability layering.
    """
    ext = read("src/types/models.ts")
    web = read("webview/src/types/session.ts")
    if ext is None or web is None:
        return

    def fields(text: str) -> set[str]:
        block = re.search(r"interface SessionCapabilities \{(.*?)\n\}", text, re.S)
        return set(re.findall(r"^\s*(\w+)\s*:", block.group(1), re.M)) if block else set()

    counted()
    a, b = fields(ext), fields(web)
    if not a or not b:
        fail("types", "SessionCapabilities could not be located on both sides of the webview boundary")
        return
    if a != b:
        only_ext = sorted(a - b)
        only_web = sorted(b - a)
        fail("types", f"SessionCapabilities has drifted: extension-only {only_ext}, webview-only {only_web}")
