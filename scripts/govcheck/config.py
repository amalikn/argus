"""This project's governance data: roots, registries, path policy and exemptions with their reasons. No checks here; checks read it."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

#: The checker's own files, excluded from the scans that would otherwise report its own pattern definitions (the split of
#: 2026-10-10 turned one file into a package).
SELF_FILES = frozenset({"scripts/check_governance.py", *(p.relative_to(ROOT).as_posix() for p in (ROOT / "scripts/govcheck").rglob("*.py"))})

# Governance surfaces whose path references must resolve.
SURFACES: tuple[str, ...] = (
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    "AI_NAVIGATION.md",
    "context-map.yaml",
    "CHANGELOG.md",
    "SCRATCHPAD.md",
    "ARCHITECTURE.md",
    "CONVENTIONS.md",
    "ROADMAP.md",
)

# Index file -> (folder it indexes, glob). Enforces BOTH directions: links resolve, and members are linked.
CATALOGS: dict[str, tuple[str, str]] = {
    # Every promoted Archcore document must be linked from the durable index. This is the orphan
    # direction that grows silently: a document nothing indexes is invisible to the next scan.
    ".archcore/README.md": (".archcore/adr", "*.adr.md"),
}

# Additional catalog folders sharing one index, checked the same way.
EXTRA_CATALOGS: tuple[tuple[str, str, str], ...] = (
    (".archcore/README.md", ".archcore/rules", "*.rule.md"),
    (".archcore/README.md", ".archcore/specs", "*.spec.md"),
    (".archcore/README.md", ".archcore/guides", "*.guide.md"),
    (".archcore/README.md", ".archcore/plans", "*.plan.md"),
)

# Files a catalog may legitimately omit (the index itself, generated output, dotfiles).
CATALOG_EXEMPT: frozenset[str] = frozenset({"README.md", "__init__.py"})

# Countable noun -> (folder, glob). A prose claim like "26 documents" is checked against the real count. Choose the glob
# deliberately: "*.md" counts the folder's own index too, which is usually not what the prose means — prefer "[0-9]*.md"
# or a similar shape when the index is excluded from the claim.
COUNT_CLAIMS: dict[str, tuple[str, str]] = {
    # "documents": ("docs", "*.md"),
    # "scripts": ("scripts", "*.py"),
}

# Lines carrying this marker state a historical fact, not a live claim, and are exempt from count checking.
ASAT_MARKER = "count:asat"

# Lines carrying this marker show an ILLUSTRATIVE filename — a naming-convention example — not a reference to a file
# that must exist. Same shape as ASAT_MARKER: explicit, per line, and visible in the document itself rather than
# hidden in an ignore-list here.
EXAMPLE_MARKER = "path:example"

# Paths a governance surface references CONDITIONALLY ("when present"). The generic skill-ai-it navigation block names
# several; each is a real artifact in SOME governed project, so its absence here is a fact about this project's
# toolchain rather than a broken reference. Registered with a per-entry reason rather than silently ignore-listed, so
# the exemption stays reviewable — remove an entry the day the artifact appears. Tune per project.
CONDITIONAL_PATHS: frozenset[str] = frozenset({
    "graphify-out/GRAPH_REPORT.md",  # Graphify disabled, graphify-out/ deleted (operator, 2026-10-10); still named by the navigation block or history
    # Alternative task runners named by the managed navigation block. Only justfile exists here.
    "Taskfile.yml",
    "Makefile",
    # Lowercase spellings the generic router lists so it can serve either convention.
    "architecture.md",
    "roadmap.md",
    "scratchpad.md",
    # Optional surfaces this project does not use.
    "docs/reports",
    "memory-bank/activeContext.md",
    "memory-bank/progress.md",
    "memory-bank/decisionLog.md",
    # The candidates queue is transient and was deleted by the promote run, so historical mentions
    # in CHANGELOG.md must still resolve. History is not a live claim.
    "ARCHCORE_PROMOTION_CANDIDATES.md",
})

# Task runner file, or None if the project has none.
TASK_RUNNER: str | None = "justfile"

# Files whose prose names task-runner recipes.
RUNNER_REFERENCES: tuple[str, ...] = ("scripts/README.md", "AGENTS.md")

# Generated artifact -> inputs it must not be older than.
DERIVED: dict[str, tuple[str, ...]] = {
    # The vendored pricing table is generated; its generator is the only thing that should rewrite it.
    "src/pricing/model-pricing.json": ("scripts/refresh-pricing.mjs",),
}

# Facts deliberately restated across surfaces. Each entry: the regex that recognises a statement of the fact, and every
# file allowed to state it. Drift fails; so does an UNREGISTERED file stating it — that is what makes this self-extending.
# Pair each entry with a spec document explaining why the duplication is intentional.
CONSTANT_SURFACES: dict[str, dict[str, object]] = {
    # "profit-gate": {
    #     "pattern": r"\$2,500",
    #     "surfaces": ("AGENTS.md", "docs/07-DECISIONS.md"),
    #     "owner": ".archcore/rules/purchase-discipline.rule.md",
    # },
}

# Append-only tables and the columns that give them their grain: (entity column, pass column). An append-only table
# records a re-measurement by ADDING a row, which is right and useless on its own — without a column that orders the
# passes there is no way to compute which row is current, and every aggregate over the table double-counts whatever was
# re-measured. Found in a governed project on 2026-08-28 with twelve rows standing for eight entities, the supersession
# recorded only in a prose note. Register the table here and the grain becomes an assertion instead of an intention.
APPEND_ONLY_TABLES: dict[str, tuple[str, str]] = {
    # "data/sku-scores.csv": ("sku_id", "scored_at"),
}

# Folder of dated evidence captures, or None if the project keeps none. A capture asserts what a source said on a date.
EVIDENCE_DIR: str | None = None  # e.g. "trackers/source-captures"

# The index file inside EVIDENCE_DIR, exempt from the provenance header because it is a catalog, not a capture.
EVIDENCE_INDEX = "README.md"

# Header fields that make a capture re-openable by someone who was not there: where it came from, when, and whether the
# fetch actually succeeded. A capture naming no URL and no HTTP status is a recollection in a capture's clothing — in
# the project this was promoted from, exactly that produced a VERIFIED cost row whose only recorded fetch returned 403.
EVIDENCE_PROVENANCE_FIELDS: tuple[str, ...] = ("Canonical URL", "Retrieved", "HTTP status")

# Captures taken before the provenance rule existed. Each MUST name the later capture supplying the missing provenance —
# this is a correction record, not an exemption. Where captures are immutable the only way to clear an entry is to take
# the correcting capture, which is the behaviour the rule wants. Removing an entry whose correction does not exist turns
# the check red rather than quiet, so the list cannot be emptied by deletion.
EVIDENCE_PROVENANCE_CORRECTED: dict[str, str] = {
    # "uae-wholesale-moq-discounts-20260828.md": "wholesale-house-price-provenance-20260828.md",
}

# Extensions scanned when hunting for unregistered restatements of a constant.
SCAN_SUFFIXES: frozenset[str] = frozenset({".md", ".py", ".yaml", ".yml"})

# Path-token discrimination. Prose is full of tokens that look like paths and are not; tune until the check is quiet.
PATHLIKE = re.compile(r"^[A-Za-z0-9._/-]+$")

REPO_SUFFIXES: frozenset[str] = frozenset({".md", ".py", ".json", ".yaml", ".yml", ".toml", ".sh", ".txt"})

IGNORE_PREFIXES: tuple[str, ...] = ("http://", "https://", "mailto:", "~/", "/")

IGNORE_EXACT: frozenset[str] = frozenset({"README.md", "AGENTS.md", "CLAUDE.md", "SCRATCHPAD.md", "CHANGELOG.md"})

# Path-shaped tokens that are not repo paths. Kept separate from IGNORE_EXACT so the reason for each
# class stays visible: these are references OUT of the repo, not exemptions for things inside it.
EXTERNAL_SLUGS: frozenset[str] = frozenset({
    "amalikn/argus",          # the fork on GitHub
    "yessGlory17/argus",      # upstream on GitHub
    "getagentseal/codeburn",  # pricing reference implementation
    "BerriAI/litellm",        # pricing data source
})

# Git refs named in prose. Slash-separated and suffix-free, so they look exactly like directories.
EXTERNAL_REFS: frozenset[str] = frozenset({
    "feat/multi-agent-observability",
})

# Path-shaped tokens that are NOTATION rather than references: a filename template, or a provider's own record
# type spelled with a slash. Registered explicitly rather than pattern-matched, so adding one is a decision
# someone made rather than a hole the resolver quietly grew.
NOTATION: frozenset[str] = frozenset({
    "YYYY/MM/DD",              # Codex rollout date partitions
    "event_msg/item_completed",  # a Codex record type, not a path
    "response_item/function_call",
    "response_item/reasoning",
})

# Workspace peers that storage policy keeps outside the repo on purpose. A file resolving here would
# mean the routing rule had been violated, so absence is the correct state rather than a defect.
EXTERNAL_PREFIXES: tuple[str, ...] = (
    "tools-runtime/",
    "tools-working-cache/",
)

# Surfaces that are DATED EVIDENCE: a record of what was true at a moment, not a live claim. They carry an
# explicit banner saying so, and that banner is what exempts them. Exempting by filename would let any file
# escape by being added to a list; exempting by an in-file statement means the document has to say so itself.
HISTORICAL_BANNER = "Dated evidence"

_NUMBER_WORDS = {
    "twenty": 20, "twenty-one": 21, "twenty-two": 22, "twenty-three": 23, "twenty-four": 24,
    "twenty-five": 25, "twenty-six": 26, "twenty-seven": 27, "twenty-eight": 28, "twenty-nine": 29,
    "thirty": 30, "thirty-one": 31, "thirty-two": 32,
}

# Agent and tool dotfolders that are governance surface. A folder here must be named in AGENTS.md. Folders NOT listed
# here are ignored entirely - this is a registry of what counts as a tool folder, not an ignore-list for what failed.
TOOL_DOTFOLDERS: frozenset[str] = frozenset({
    ".archcore", ".vscode", ".ai-context", ".code-context-notes", ".remember", ".agents", ".serena", ".cursor",
    ".codex", ".github", ".backlog",
})

# The checker's own shape (skill-ai-it patterns/governance-checks.md, "Structure and growth"; adopted 2026-10-10).
CHECKER_PACKAGE = "scripts/govcheck"
MODULE_MAX_LINES = 400
CHECK_MAX_LINES = 60
#: Checks over CHECK_MAX_LINES when the standard was adopted, with their size then: a ratchet; they may shrink, never grow. None at adoption.
OVERSIZE: dict[str, int] = {}
#: The shared engine every project's core.py must equal.
CORE_TEMPLATE = "/Volumes/Data/_ai/_skills/skills_stuff/specialists/project/skill-ai-it/templates/govcheck/core.py"
