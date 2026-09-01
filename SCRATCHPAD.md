# SCRATCHPAD

Agent working memory for the Argus multi-agent observability fork. Use for: draft plans, terminal output, intermediate analysis, refactor outlines. Cleared between sessions unless content is
explicitly marked KEEP.

---

<!-- KEEP: populated 20260901_1800 from claude-mem plus this session. memory-keeper and mcp-project-context returned no argus entries. -->

## Current state

**Phase:** Milestone 1 complete and committed. Halted at Stop 1, awaiting an explicit go for Milestone 2.

The fork lives at `amalikn/argus` on branch `feat/multi-agent-observability`, with the unmodified upstream preserved at tag `baseline-upstream-argus`. Milestone 1 measured the baseline rather than
assuming it: five of six quality gates pass, and the sixth fails because the gate does not exist. Twelve findings are recorded in the audit, two of which reorder later milestones. No file under `src/`
or `webview/` has been modified. Governance and an executable coherence checker are now in place.

---

## Open items

- [ ] Milestone 2 not started. Gated on an explicit go, per the Stop 1 discipline the plan now carries.
- [ ] `npm test` fails (F1). There is no test directory under source, and no runner in the dependency tree. The whole regression strategy in the plan depends on this being fixed first.
- [ ] Sanitized Claude fixtures not extracted. The inventory proves 12 of 15 categories are sourceable; extraction waits for a harness to consume them.
- [ ] Cost still computed by two hardcoded tables (F5). The vendored pricing table exists; nothing consumes it yet.
- [ ] Extension never launched in an Extension Development Host. Nothing yet proves it renders a session.
- [ ] `ARCHCORE_PROMOTION_CANDIDATES.md` awaiting review, then `/skill-ai-it promote`.

---

## Key anchors

| Item               | Detail                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Fork               | `https://github.com/amalikn/argus`, branch `feat/multi-agent-observability`                       |
| Upstream           | `yessGlory17/argus`, fetch-only, push URL set to `DISABLED_read_only_upstream`                    |
| Baseline           | commit `3bfbd8b`, tag `baseline-upstream-argus`                                                   |
| Plan               | [docs/argus-multi-agent-implementation-plan-20260901_1708.md](docs/argus-multi-agent-implementation-plan-20260901_1708.md)                                       |
| Audit              | [docs/architecture/current-state-audit.md](docs/architecture/current-state-audit.md)                                                          |
| Claude transcripts | `~/.claude/projects` — 10,072 sessions, 1,018,178 lines, 5.03 GB, zero undecodable lines          |
| Codex rollouts     | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` — 722 files, `{type, timestamp, payload}` per line |
| Hermes sessions    | `~/.hermes/sessions/*.jsonl` — structured per turn, NOT `~/.hermes/logs/`                         |
| Pricing source     | LiteLLM dataset, vendored to `src/pricing/model-pricing.json`, 2571 models                        |
| Node runtime       | 22.23.2 via mise pin                                                                              |
| Python runtime     | 3.14.7 via `tools-working-cache/argus/venv`                                                       |
| Gate logs and VSIX | `tools-runtime/argus/`                                                                            |

---

## Recent decisions

- 20260901 — Hermes anchors on `~/.hermes/sessions/*.jsonl`, not `~/.hermes/logs/`. The structured store was located before implementation, so Milestone 7 starts from evidence rather than discovery.
- 20260901 — Reasoning is parsed but gated: never cached as text, masked in the UI, replaced by a placeholder in default exports, included only in the explicit unredacted export. The original absolute
  prohibition was unimplementable because two of three providers persist reasoning in the evidence.
- 20260901 — Pricing comes from the vendored LiteLLM dataset, refreshed by a developer script, never fetched at runtime. An unknown model is absent from the table rather than priced at a fallback
  rate.
- 20260901 — Three hard stop gates added to the milestone sequence. M1 to M6 mandatory, M7 to M8 target, M9 to M11 de-scopable.
- 20260901 — Commits on amalikn remotes use `djmalik@gmail.com`, applied by a `hasconfig:remote.*.url` include in the global git config.
- 20260901 — Generated context artifacts excluded via `.git/info/exclude` rather than `.gitignore`, to keep the upstream-sync merge surface small.

---

## Session history (summaries — full detail in claude-mem)

### 20260901 — plan review, Milestone 1, governance bootstrap
- Reviewed the implementation plan, verified its path and schema claims against live systems, applied four corrections before execution.
- Ran Milestone 1: forked, tagged the baseline, measured all six gates, mapped code to the plan conceptual roles, produced 12 findings, inventoried fixtures across 10,072 sessions.
- Built the pricing layer after finding the upstream hardcoded table overstates opus-4-6 by 3x and silently prices unknown models at Sonnet rates.
- Bootstrapped governance and an executable coherence checker; proved the checker can fail before trusting it.
- Evidence basis: claude-mem observations from 20260901, plus the committed audit.

---

## Next actions

- Await go for Milestone 2, then start at M2.1 test-harness selection.
- Review `ARCHCORE_PROMOTION_CANDIDATES.md` and decide what to promote.

---

## Memory pointers (navigation only — content is above)

- memory-keeper: no argus entries as at 20260901
- mcp-project-context: no argus project; `tools_stuff` project id `21603336-2da7-48cc-99be-7dc564fd7ceb`
- claude-mem: observations from 20260901 covering the fork, the baseline commit, the governance scaffold and the submodule registration
