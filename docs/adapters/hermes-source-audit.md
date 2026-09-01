# Hermes Source Audit

Milestone 7 deliverable. Produced 2026-09-01 by inspecting the live local store and the installed source.

## Contents

- [Pinned versions](#pinned-versions)
- [Headline finding: the accepted ADR is incomplete](#headline-finding-the-accepted-adr-is-incomplete)
- [The snapshot format: `session_*.json`](#the-snapshot-format-session_json)
- [The mirror format: `*.jsonl`](#the-mirror-format-jsonl)
- [Session id derivation: the filename lies 31 percent of the time](#session-id-derivation-the-filename-lies-31-percent-of-the-time)
- [Tool calls carry results, and shell exit codes are real](#tool-calls-carry-results-and-shell-exit-codes-are-real)
- [Hermes does not persist the usage its model provider returns](#hermes-does-not-persist-the-usage-its-model-provider-returns)
- [Malformed records are real here, unlike Claude](#malformed-records-are-real-here-unlike-claude)
- [The databases add nothing worth reading](#the-databases-add-nothing-worth-reading)
- [Profiles](#profiles)
- [What Milestone 8 should build](#what-milestone-8-should-build)
- [Not verified](#not-verified)

---

## Pinned versions

| Item                                | Value                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Upstream repository                 | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent), MIT, Python                                    |
| Upstream HEAD pinned for this audit | `5a8e8a6b87487c0e0785cd9eb561cc6a96c64f5e`, authored 2026-09-01T09:00:57Z |
| Installed local checkout            | `68d081f5701bc44ac9de4d82eb33d4f860ba2c4c`, authored 2026-05-10           |
| Local evidence written between      | 2026-05-11 and 2026-05-29                                                 |

The installed checkout is roughly four months behind upstream HEAD, and the local evidence was written by that older build. Everything below describes what a 2026-05 Hermes wrote. Treat it as a
current-state observation of the operator machine, not as a description of what upstream writes today. That gap is itself the most important caveat in this document.

## Headline finding: the accepted ADR is incomplete

[`.archcore/adr/hermes-evidence-source.adr.md`](../../.archcore/adr/hermes-evidence-source.adr.md) records `~/.hermes/sessions/*.jsonl` as the canonical Hermes store. That was correct as far as it
went, and it correctly displaced the plan's original `~/.hermes/logs/` premise. It is not the whole store.

`~/.hermes/sessions/` holds **two formats written by two different writers**:

| Form                                         | Files       | Size     | Records         | Carries an explicit session id |
| -------------------------------------------- | ----------- | -------- | --------------- | ------------------------------ |
| `<YYYYMMDD>_<HHMMSS>_<shortid>.jsonl`        | 60          | 18.2 MB  | 4,601 rows      | no                             |
| `session_<YYYYMMDD>_<HHMMSS>_<shortid>.json` | 243         | 119.9 MB | 33,668 messages | yes                            |
| `saved/`                                     | 1 directory | —        | —               | not audited                    |

**All 60 `.jsonl` stems appear as `session_id` values inside the `.json` store.** The two writers describe the same sessions: the JSONL is a streaming append-mirror covering a subset, and the JSON is
the complete snapshot covering a superset. The JSON store is four times larger by file count and roughly seven times larger by volume.

The adapter must therefore read the `.json` snapshot as its primary source and treat the `.jsonl` mirror as secondary. A superseding ADR records this;
[`.archcore/adr/hermes-evidence-source.adr.md`](../../.archcore/adr/hermes-evidence-source.adr.md) is marked superseded rather than edited, per the acceptance rules.

## The snapshot format: `session_*.json`

One JSON object per file. Top-level keys, present on all 243 files:

| Key                             | Notes                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `session_id`                    | The authoritative id. See the id-derivation finding below                                                          |
| `model`                         | `deepseek-v4-flash` (228), `llama3-groq-tool-use:8b` (9), `deepseek-v4-pro` (2), `gemini-2.5-flash` (1), empty (3) |
| `base_url`                      | provider endpoint                                                                                                  |
| `platform`                      | `telegram` (141), `cli` (64), `discord` (21), `acp` (8), `curator` (2), null (3)                                   |
| `session_start`, `last_updated` | real lifecycle timestamps, so `startedAt` and `updatedAt` are read rather than derived                             |
| `system_prompt`                 | full text — a sanitization concern for any fixture                                                                 |
| `tools`                         | the tool roster declared for the session, not evidence that any was called                                         |
| `message_count`                 | equals `len(messages)` on all 243 files, so it is a free integrity assertion                                       |
| `messages`                      | the turn array                                                                                                     |

Message keys across 33,668 messages: `role` and `content` on every one, then `tool_call_id` (15,846), `finish_reason` (15,316), `reasoning` (15,054), `reasoning_content` (15,034), `tool_calls`
(13,135), `name` (8,625), `tool_name` (6), `_empty_recovery_synthetic` (4).

Note `tool_name` against `name`: 6 records against 8,625 use the other spelling. An adapter reading only `name` silently loses the tool identity on those. The same inconsistency appears in the JSONL
mirror at the same ratio, so it is a writer inconsistency rather than a format difference.

`_empty_recovery_synthetic` marks a record Hermes fabricated to recover from an empty model response. It is not evidence of anything the agent did, and normalizing it as a message would put an
invented turn in a forensic timeline. It must be preserved as an unknown or flagged event, never as a plain assistant message.

## The mirror format: `*.jsonl`

One JSON object per line, chat-shaped. Roles observed: `assistant` (2,091), `tool` (1,991), `user` (461), `session_meta` (53).

`session_meta` is a **role on the first line**, not a wrapper: it carries `role`, `tools`, `model`, `platform`, `timestamp` and nothing else. Critically it carries **no session id**, which is why the
JSONL form alone forces the id to come from the filename.

The header is not guaranteed. 53 of 60 files begin with a `session_meta` row; the remaining 7 begin with a content row. An adapter that assumes a header exists mis-parses 12 percent of this store.

## Session id derivation: the filename lies 31 percent of the time

The installed source generates an id as `f"{timestamp:%Y%m%d_%H%M%S}_{uuid4().hex[:6]}"` and writes `session_{id}.json`. Measured against the actual store, **76 of 243 filenames do not match the
`session_id` inside the file**. The observed JSONL stems also carry 8 hex characters where the CLI writer emits 6, which is a second writer disagreeing with the first.

**Use the in-record `session_id` wherever one exists.** Derive from the filename only for the JSONL mirror, which has no alternative, and record that derivation as `confidence: "derived"`.

## Tool calls carry results, and shell exit codes are real

`tool_calls` entries are OpenAI-shaped: `{id, call_id, response_item_id, type, function: {name, arguments}}`. A following `role: "tool"` record carries `tool_call_id`, `name` and `content`, where
`content` is a JSON string.

Decoding those result payloads across the store, the keys are `error` (789), `output` (742), `exit_code` (684), `success` (593), `content` (339), `total_lines` (286), `file_size` (283), `truncated`
(283), `is_binary` (283), `is_image` (283).

**`exit_code` is present.** Hermes therefore supports `shellOutput`, and a `shell.command` status can be marked `exact` rather than derived — the same as Codex and unlike Claude.

Tool vocabulary by call count: `terminal` (724), `read_file` (345), `patch` (170), `search_files` (149), `browser_navigate` (90), `skill_view` (67), `memory` (66), `write_file` (54), `execute_code`
(52), `session_search` (42), `browser_snapshot` (40), `browser_click` (39), `todo` (32), `browser_console` (31).

Mapping: `terminal` and `execute_code` to `shell.command`; `read_file` to `file.read`; `write_file` to `file.write`; `patch` to `file.edit`; `browser_*` to `network.tool`; the rest to `tool.call`. No
`mcp__`-prefixed names appear, so `mcpCalls` is false for this store.

## Hermes does not persist the usage its model provider returns

Searched every record in both formats for `usage`, `token_usage`, `tokens`, `prompt_tokens`, `input_tokens`, `total_tokens` and `cost`. **Zero hits.**

**State this precisely, because the short version is wrong.** Tokens are consumed on every Hermes turn: each session records a `model` and a `base_url`, and 228 of 243 ran `deepseek-v4-flash` against
a provider API that returns usage in its response. Hermes discards that response field rather than writing it to the session. So the finding is *this client does not persist the counts*, not *no
tokens were used* — and the counts still exist upstream at the model provider, outside anything this tool can read.

That distinction decides what a fix looks like: it is a Hermes logging gap, closable by Hermes persisting what it already receives, not a limitation of the observability tool. `response_store.db`
would have been the natural place for it and is empty.

Consequences for the capability flags, and they are not small:

- `tokenUsage: false` and `contextMetrics: false` for every Hermes session in this store — read as "not recorded", never as "not consumed".
- `cost: false`, regardless of model. Not because the model is unpriceable — `deepseek-v4-flash` is in the vendored pricing table — but because there are no token counts to multiply. A cost view built
  from an assumed token count would be an invention.
- `llama3-groq-tool-use:8b` is additionally absent from the pricing table, being a local Ollama model. Even if usage appeared, that model would still yield `undefined`.

This is the strongest vindication so far of the undefined-is-not-zero rule. Two of the three providers report tokens and one reports none at all, and the difference is invisible unless the capability
flag carries it.

## Malformed records are real here, unlike Claude

Five lines across the JSONL store fail to parse, all in one file, all in `browser_navigate` tool results. They are **not corruption and not truncation**: a result payload contains literal newlines
written unescaped, so one logical record spans several physical lines.

This is a third failure mode beyond the two the fixture corpus already covers. A line-oriented parser silently drops those records. The adapter should attempt to rejoin continuation lines by
accumulating until the buffer parses, and record a diagnostic when it does. Note the contrast: a scan of 1,018,178 Claude lines found zero undecodable ones, so this hazard is Hermes-specific and would
never have been found by generalizing from Claude.

## The databases add nothing worth reading

Inspected read-only with `mode=ro&immutable=1`, so nothing could be written to the operator's live store.

| Store                      | Size          | Verdict                                                                                                                                                 |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state.db`                 | 501.4 MB, 40  | Live gateway runtime state — routing, heartbeats, delivery obligations, hosted rooms. Nearly every table empty. Actively written with WAL. **Do not read.** |
|                            |   tables      |   `async_delegations` carries a `parent_session_id` that would give subagent linkage, but it holds zero rows                                            |
| `response_store.db`        | 0.0 MB        | `conversations` and `responses`, both zero rows. Nothing to add                                                                                         |
| `verification_evidence.db` | 0.1 MB        | `verification_state` holds 46 rows of `session_id`, `root`, `changed_paths_json`; `verification_events` holds zero. Marginal, and the events table that |
|                            |               |   would make it useful is empty                                                                                                                         |
| `checkpoints/`             | 2 entries     | Filesystem snapshots taken by `CheckpointManager`, not conversation evidence                                                                            |

**The session files are the only meaningful source.** That answers the audit question the ADR posed and removes the SQLite work from Milestone 8.

## Profiles

`get_hermes_home()` reads `HERMES_HOME` and falls back to `~/.hermes`. The source carries an explicit warning path for the case where `HERMES_HOME` is unset while an `active_profile` file names a
non-default profile, logging to `errors.log` so cross-profile data corruption is diagnosable rather than silent, and citing upstream issue 18594.

No `active_profile` file exists on this machine and no profile directories are present, so profile support **cannot be verified locally**. The adapter should honour `HERMES_HOME` and accept configured
paths, and the profile field should stay unpopulated rather than guessed.

## What Milestone 8 should build

| Decision                                               | Rationale                                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary source is `sessions/session_*.json`            | Four times the files, seven times the volume, carries `session_id`, `session_start`, `last_updated` and `message_count`                     |
| Secondary source is `sessions/*.jsonl`                 | Same sessions, fewer of them, no embedded id. Useful only for live tailing, where a growing JSONL is cheaper to follow than a rewritten     |
|                                                        |   snapshot                                                                                                                                  |
| Id comes from the record, never the filename           | 76 of 243 disagree                                                                                                                          |
| Assert `message_count == len(messages)`                | A free integrity check the format hands us                                                                                                  |
| Shell status is `exact`                                | `exit_code` is recorded                                                                                                                     |
| Lifecycle is `exact` for start and update              | `session_start` and `last_updated` are real fields, not inferred                                                                            |
| Subagent and dependency structure is `derived` at best | Nothing in either format records it; `async_delegations` is empty                                                                           |
| `tokenUsage`, `contextMetrics`, `cost` are false       | No token counts exist in either format                                                                                                      |
| Rejoin unescaped-newline continuation lines            | Five real records in this store are otherwise lost                                                                                          |
| Tolerate a missing `session_meta` header               | 7 of 60 JSONL files have none                                                                                                               |
| Read both `name` and `tool_name`                       | The writer is inconsistent at a ratio of 8,625 to 6                                                                                         |
| Never normalize `_empty_recovery_synthetic` as a plain | It is a fabricated recovery record, not something the agent did                                                                             |
|   message                                              |                                                                                                                                             |

## Not verified

| Item                                                | Why                                                           |
| --------------------------------------------------- | ------------------------------------------------------------- |
| Whether upstream HEAD still writes these formats    | The installed build is four months behind the pinned commit   |
| Profile-specific roots                              | No non-default profile exists on this machine                 |
| `sessions/saved/`                                   | Not inspected                                                 |
| Whether `state.db` is populated on a busier install | Nearly every table is empty here, which may not generalize    |
| Rotation behaviour of `logs/`                       | Not investigated, because the logs are not needed as a source |
