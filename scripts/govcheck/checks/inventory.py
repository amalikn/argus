"""Counts, catalogs and the folder/source-dir/dotfolder inventories the docs claim match the tree."""

from __future__ import annotations

import re

from ..core import counted, fail
from ..config import (
    ASAT_MARKER,
    CATALOG_EXEMPT,
    COUNT_CLAIMS,
    ROOT,
    SURFACES,
    TOOL_DOTFOLDERS,
    _NUMBER_WORDS,
)
from ..helpers import (
    _catalog_pairs,
    members,
    read,
    without_code,
)

def check_count_claims() -> None:
    """Prose stating a quantity matches the real count. Lines marked as historical facts are exempt."""
    for noun, (folder, glob) in COUNT_CLAIMS.items():
        actual = len(members(folder, glob))
        pattern = re.compile(rf"(\d+)\s+{re.escape(noun)}\b", re.IGNORECASE)
        for surface in SURFACES:
            text = read(surface)
            if text is None:
                continue
            for line in without_code(text).splitlines():
                if ASAT_MARKER in line:
                    continue
                for claim in pattern.finditer(line):
                    counted()
                    if int(claim.group(1)) != actual:
                        fail("count", f"{surface} claims {claim.group(1)} {noun}; {folder}/{glob} holds {actual}")


def check_catalog_coverage() -> None:
    """Both directions: the catalog names nothing missing, and nothing present is uncataloged.

    The second direction is the one that grows silently, and it is what makes this checker self-extending — a new file
    turns the build red until it is registered somewhere.
    """
    for index, folder, glob in _catalog_pairs():
        text = read(index)
        if text is None:
            continue
        body = without_code(text)
        for item in members(folder, glob):
            if item.name in CATALOG_EXEMPT or (ROOT / index).resolve() == item.resolve():
                continue
            counted()
            if item.name not in body:
                fail("coverage", f"{folder}/{item.name} exists but is not cataloged in {index}")


def check_archcore_index_count() -> None:
    """The document count in .archcore/README.md is derived from the directory, not authored.

    An authored count drifts the moment a document is added, and it drifts SILENTLY because nothing compares the
    sentence to the folder. This one said "twenty-one" for the hours between Milestone 7 adding a superseding ADR
    and this check existing.

    Rule: derive, never author. .archcore/README.md is the index; the directory is the thing indexed.
    """
    text = read(".archcore/README.md")
    base = ROOT / ".archcore"
    if text is None or not base.is_dir():
        return

    actual = sum(1 for p in base.rglob("*.md") if p.name != "README.md")
    counted()

    claimed = None
    match = re.search(r"\b([A-Za-z-]+|\d+)\s+documents\b", text)
    if match:
        token = match.group(1).lower()
        claimed = _NUMBER_WORDS.get(token, int(token) if token.isdigit() else None)

    if claimed is None:
        fail("archcore", ".archcore/README.md states no document count for the index to be checked against")
    elif claimed != actual:
        fail("archcore", f".archcore/README.md claims {claimed} documents; {actual} exist on disk")


def check_architecture_names_every_source_dir() -> None:
    """ARCHITECTURE.md names every directory under src/.

    The orphan direction that grows silently. Found on 20260901 by an inverse sweep: the architecture document of a
    provider-neutral fork named NO adapter at all - src/adapters and all three provider directories, plus
    src/core/adapters and src/core/models, were absent. The component table had been written at Milestone 1 against the
    upstream tree and never grew with the code. Every path IN it resolved, so path checking had nothing to say.

    Rule: ARCHITECTURE.md is the component map. A directory the map does not name is a component nobody documented.
    """
    text = read("ARCHITECTURE.md")
    src = ROOT / "src"
    if text is None or not src.is_dir():
        return
    body = without_code(text)
    for directory in sorted(p for p in src.rglob("*") if p.is_dir()):
        rel = directory.relative_to(ROOT).as_posix()
        counted()
        if rel not in body:
            fail("architecture", f"{rel} exists but ARCHITECTURE.md does not name it")


def check_agents_names_every_tool_dotfolder() -> None:
    """AGENTS.md names every agent/tool dotfolder present in the repo.

    A tool folder nobody documented is a folder the next agent deletes as editor residue. Found on 20260902 when
    .vscode/ was added to carry the Extension Development Host launch configuration: three dotfolders were already
    present and undocumented, and nothing could have reported that, because every path check here verifies that a
    referenced path EXISTS and none verifies that an existing surface is referenced.

    Rule: presence on disk is the trigger. Adding a tool folder means naming it in AGENTS.md in the same pass.
    """
    text = read("AGENTS.md")
    if text is None:
        return
    body = without_code(text)
    for child in sorted(p for p in ROOT.iterdir() if p.is_dir() and p.name in TOOL_DOTFOLDERS):
        counted()
        if child.name not in body:
            fail("tool-folders", f"{child.name}/ exists but AGENTS.md does not name it")
