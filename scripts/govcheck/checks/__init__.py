"""The checks, by family, and the order they run in (unchanged from the single-file checker, so output is identical)."""

from __future__ import annotations

from . import paths
from . import inventory
from . import tasks
from . import sync
from . import records
from . import archcore
from . import structure

CHECKS = (
    inventory.check_agents_names_every_tool_dotfolder,
    inventory.check_archcore_index_count,
    inventory.check_architecture_names_every_source_dir,
    archcore.check_no_resolved_finding_asserted_open,
    sync.check_capability_types_mirror,
    archcore.check_archcore_frontmatter,
    archcore.check_supersession_chain,
    paths.check_referenced_paths,
    paths.check_index_links,
    inventory.check_count_claims,
    inventory.check_catalog_coverage,
    tasks.check_task_recipes,
    tasks.check_interpreter_pinning,
    tasks.check_derived_freshness,
    sync.check_constant_sync,
    records.check_append_only_grain,
    records.check_evidence_provenance,
    structure.check_govcheck_structure,
)
