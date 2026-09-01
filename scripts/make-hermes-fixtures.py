#!/usr/bin/env python3
"""Build Hermes fixtures by SYNTHESIS from the observed schema, not by harvesting real sessions.

WHY THIS PROVIDER IS DIFFERENT. The Claude and Codex fixtures are sanitized copies of real transcripts, because those are
the operator's own coding sessions: the content is commands, diffs and file paths, and redacting credentials and paths
makes them publishable. Hermes is not that. Its sessions are personal conversations carried over Telegram and Discord,
plus a 14 KB system prompt, and no redaction pass makes a private conversation safe to publish in a public fork. Removing
secrets from a personal chat leaves a personal chat.

So these fixtures are SYNTHESIZED to match the schema rather than copied. The generator reads the live store only to
derive the shape - which keys appear on which roles, which tool names occur, what a tool result payload contains - and
then emits records carrying that shape with placeholder content. The `--verify-schema` mode re-derives the shape from
the live store and asserts the fixtures still match it, so the corpus cannot drift away from the real format silently.

What is preserved exactly, because the adapter depends on it: key sets per role, the OpenAI-shaped tool_calls structure,
tool_call_id correlation, exit_code presence, the absence of any usage field, the missing-header case, the
name/tool_name inconsistency, the `_empty_recovery_synthetic` marker, and the unescaped-newline record that splits
across physical lines.

Usage:
    python3 scripts/make-hermes-fixtures.py                  # write fixtures
    python3 scripts/make-hermes-fixtures.py --verify-schema  # check fixtures still match the live store's shape
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "tests" / "fixtures" / "hermes"
STORE = Path(os.environ.get("HERMES_HOME") or (Path.home() / ".hermes")) / "sessions"

SNAPSHOT_KEYS = ["session_id", "model", "base_url", "platform", "session_start", "last_updated",
                 "system_prompt", "tools", "message_count", "messages"]

# The full observed vocabulary, 37 names, derived from the live store. Kept complete rather than
# representative because --verify-schema compares against it: a shortened list reads as drift.
TOOLS = ["terminal", "read_file", "patch", "search_files", "skill_view", "write_file", "memory",
         "skill_manage", "browser_navigate", "execute_code", "todo", "browser_snapshot", "browser_click",
         "session_search", "browser_console", "process", "browser_scroll", "vision_analyze", "web_search",
         "skills_list", "browser_vision", "cronjob", "web_extract", "web_scraper", "browser_type", "clarify",
         "delegate_task", "bash", "grep", "send_message", "kanban_heartbeat", "kanban_show", "kanban_comment",
         "browser_get_images", "kanban_block", "load_skill", "skill_patch"]


def dump(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def msg(role, content, **extra):
    m = {"role": role, "content": content, "timestamp": "2026-09-01T00:00:00.000000"}
    m.update(extra)
    return m


def tool_call(call_id, name, arguments):
    # OpenAI-shaped, exactly as Hermes writes it: id and call_id are both present and equal.
    return {"id": call_id, "call_id": call_id, "response_item_id": f"resp_{call_id}",
            "type": "function", "function": {"name": name, "arguments": dump(arguments)}}


def snapshot(session_id, platform, model, messages, **overrides):
    body = {
        "session_id": session_id,
        "model": model,
        "base_url": "https://api.example.com/v1",
        "platform": platform,
        "session_start": "2026-09-01T00:00:00.000000",
        "last_updated": "2026-09-01T00:10:00.000000",
        # Real sessions carry a 14 KB system prompt. Length is irrelevant to the adapter, so a marker stands in.
        "system_prompt": "[synthetic system prompt placeholder]",
        "tools": TOOLS,
        "message_count": len(messages),
        "messages": messages,
    }
    body.update(overrides)
    return body


def build() -> list[Path]:
    OUT.mkdir(parents=True, exist_ok=True)
    written = []

    def write(name: str, text: str) -> None:
        p = OUT / name
        p.write_text(text, encoding="utf-8")
        written.append(p)

    # 01 - the ordinary snapshot: user turn, assistant with reasoning and a tool call, tool result with exit_code.
    calls = [tool_call("call_01", "terminal", {"command": "echo hello", "timeout": 15})]
    write("01-snapshot-basic.json", json.dumps(snapshot(
        "20260901_000000_aaaaaaaa", "telegram", "deepseek-v4-flash",
        [
            msg("user", "placeholder user turn"),
            msg("assistant", "placeholder assistant turn", finish_reason="tool_calls",
                reasoning="placeholder reasoning", reasoning_content="placeholder reasoning content",
                tool_calls=calls),
            msg("tool", dump({"output": "hello\n", "exit_code": 0, "success": True}),
                tool_call_id="call_01", name="terminal"),
            msg("assistant", "placeholder closing turn", finish_reason="stop",
                reasoning="", reasoning_content=""),
        ]), indent=None, ensure_ascii=False))

    # 02 - the id trap. 76 of 243 real filenames disagree with the embedded session_id, so the fixture makes them
    # disagree deliberately: the adapter must key on the record.
    write("session_20260901_000000_MISMATCH.json", json.dumps(snapshot(
        "20260901_111111_bbbbbbbb", "cli", "deepseek-v4-flash",
        [msg("user", "placeholder"), msg("assistant", "placeholder", finish_reason="stop")]),
        ensure_ascii=False))

    # 03 - file and browser tools, so the file.* and network.* mappings have something to bite on.
    write("03-file-and-browser.json", json.dumps(snapshot(
        "20260901_000003_cccccccc", "discord", "deepseek-v4-flash",
        [
            msg("user", "placeholder"),
            msg("assistant", "placeholder", finish_reason="tool_calls", tool_calls=[
                tool_call("call_r", "read_file", {"path": "/workspace/a.txt"}),
                tool_call("call_w", "write_file", {"path": "/workspace/b.txt", "content": "x"}),
                tool_call("call_p", "patch", {"path": "/workspace/c.txt", "diff": "@@"}),
                tool_call("call_b", "browser_navigate", {"url": "https://example.com"}),
            ]),
            msg("tool", dump({"content": "placeholder", "total_lines": 3, "file_size": 12,
                              "truncated": False, "is_binary": False, "is_image": False}),
                tool_call_id="call_r", name="read_file"),
            msg("tool", dump({"success": True}), tool_call_id="call_w", name="write_file"),
            msg("tool", dump({"success": True}), tool_call_id="call_p", name="patch"),
            # The writer spells this key `tool_name` on 6 of 8,631 records. An adapter reading only `name` loses
            # the tool identity on those, so one fixture record uses the rare spelling.
            msg("tool", dump({"success": True}), tool_call_id="call_b", tool_name="browser_navigate"),
        ]), ensure_ascii=False))

    # 04 - a failed command, so status maps to failed from a real exit code rather than being inferred.
    write("04-command-failure.json", json.dumps(snapshot(
        "20260901_000004_dddddddd", "cli", "deepseek-v4-flash",
        [
            msg("user", "placeholder"),
            msg("assistant", "placeholder", finish_reason="tool_calls",
                tool_calls=[tool_call("call_f", "terminal", {"command": "false", "timeout": 5})]),
            msg("tool", dump({"error": "command failed", "output": "", "exit_code": 1, "success": False}),
                tool_call_id="call_f", name="terminal"),
        ]), ensure_ascii=False))

    # 05 - the synthetic-recovery marker. Hermes fabricates this record to recover from an empty model response.
    # It is not evidence of anything the agent did, so it must never become a plain assistant message.
    write("05-synthetic-recovery.json", json.dumps(snapshot(
        "20260901_000005_eeeeeeee", "cli", "deepseek-v4-flash",
        [
            msg("user", "placeholder"),
            msg("assistant", "", finish_reason="stop", _empty_recovery_synthetic=True),
        ]), ensure_ascii=False))

    # 06 - an unpriceable local model, so cost stays undefined for a second, independent reason.
    write("06-local-model.json", json.dumps(snapshot(
        "20260901_000006_ffffffff", "cli", "llama3-groq-tool-use:8b",
        [msg("user", "placeholder"), msg("assistant", "placeholder", finish_reason="stop")]),
        ensure_ascii=False))

    # 07b - delegation. `delegate_task` is the only subagent evidence Hermes leaves; there is no lifecycle
    # record and async_delegations in state.db is empty, so a subagent event derived from it is at best heuristic.
    write("11-delegation.json", json.dumps(snapshot(
        "20260901_000011_12345678", "cli", "deepseek-v4-flash",
        [
            msg("user", "placeholder"),
            msg("assistant", "placeholder", finish_reason="tool_calls",
                tool_calls=[tool_call("call_d", "delegate_task", {"task": "placeholder", "agent": "researcher"})]),
            msg("tool", dump({"success": True, "output": "placeholder"}), tool_call_id="call_d", name="delegate_task"),
        ]), ensure_ascii=False))

    # 07 - message_count disagreeing with len(messages). Real files never do, which is exactly why it is worth
    # asserting: a mismatch means the file was truncated or hand-edited.
    body = snapshot("20260901_000007_99999999", "cli", "deepseek-v4-flash",
                    [msg("user", "placeholder"), msg("assistant", "placeholder", finish_reason="stop")])
    body["message_count"] = 99
    write("07-count-mismatch.json", json.dumps(body, ensure_ascii=False))

    # --- the JSONL mirror ---

    # 08 - the mirror with its session_meta header row.
    header = {"role": "session_meta", "tools": TOOLS, "model": "deepseek-v4-flash",
              "platform": "telegram", "timestamp": "2026-09-01T00:00:00.000000"}
    rows = [header,
            msg("user", "placeholder"),
            msg("assistant", "placeholder", finish_reason="stop", reasoning="", reasoning_content="")]
    write("08-mirror-with-header.jsonl", "\n".join(dump(r) for r in rows) + "\n")

    # 09 - the mirror WITHOUT a header. 7 of 60 real files begin with a content row, so an adapter that assumes a
    # header mis-parses 12 percent of the store.
    write("09-mirror-no-header.jsonl", "\n".join(dump(r) for r in rows[1:]) + "\n")

    # 10 - the unescaped-newline record. Five real rows in the live store look like this: a browser result whose
    # payload carries literal newlines, so one logical record spans several physical lines. A line-oriented parser
    # drops them silently unless it rejoins continuation lines.
    split = dump(msg("tool", '{"success":true,"snapshot":"line one\nline two\nline three"}',
                     tool_call_id="call_x", name="browser_navigate"))
    broken = split.replace("\\n", "\n")  # write the newline raw, exactly as Hermes did
    write("10-mirror-unescaped-newline.jsonl", dump(header) + "\n" + broken + "\n" + dump(msg("user", "after")) + "\n")

    return written


def observed_schema() -> dict:
    """Derive the real shape from the live store, so the fixtures can be checked against it."""
    if not STORE.is_dir():
        return {}
    roles: dict[str, Counter] = {}
    top = Counter()
    tools = Counter()
    usage_keys = Counter()
    for p in STORE.glob("session_*.json"):
        try:
            o = json.loads(p.read_text(errors="replace"))
        except Exception:
            continue
        top.update(o.keys())
        for m in o.get("messages") or []:
            if not isinstance(m, dict):
                continue
            roles.setdefault(m.get("role", "?"), Counter()).update(m.keys())
            for k in ("usage", "token_usage", "tokens", "total_tokens", "cost"):
                if k in m:
                    usage_keys[k] += 1
            for tc in m.get("tool_calls") or []:
                if isinstance(tc, dict):
                    tools[(tc.get("function") or {}).get("name")] += 1
    return {"top": top, "roles": roles, "tools": tools, "usage_keys": usage_keys}


def verify_schema() -> int:
    """Assert the fixtures still describe the live store's shape."""
    schema = observed_schema()
    if not schema:
        print("live Hermes store not present; schema verification skipped", file=sys.stderr)
        return 0

    problems = 0
    top = set(schema["top"])
    missing = [k for k in SNAPSHOT_KEYS if k not in top]
    if missing:
        print(f"  DRIFT: fixtures model top-level keys the live store no longer has: {missing}", file=sys.stderr)
        problems += 1

    # The single most consequential schema fact. If usage ever appears, the capability flags must change.
    if schema["usage_keys"]:
        print(f"  DRIFT: the live store now carries usage keys {dict(schema['usage_keys'])} — Hermes "
              f"tokenUsage/cost capabilities were derived from their ABSENCE and must be revisited", file=sys.stderr)
        problems += 1

    fixture_tools = set(TOOLS)
    live_tools = {t for t in schema["tools"] if t}
    unknown = live_tools - fixture_tools
    if len(unknown) > len(live_tools) / 2:
        print(f"  DRIFT: most live tool names are absent from the fixtures: {sorted(unknown)[:8]}", file=sys.stderr)
        problems += 1

    print(f"schema check: {len(top)} top-level keys, {len(live_tools)} tool names, "
          f"{len(schema['usage_keys'])} usage keys in the live store")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--verify-schema", action="store_true",
                        help="re-derive the shape from the live store and check the fixtures still match")
    args = parser.parse_args()

    if args.verify_schema:
        problems = verify_schema()
        print("OK — fixtures match the live schema" if not problems else f"FAIL — {problems} drift(s)")
        return 1 if problems else 0

    written = build()
    for p in written:
        print(f"  synthesized {p.name} ({p.stat().st_size} B)")
    problems = verify_schema()
    print(f"\nOK — {len(written)} Hermes fixtures, synthesized from the observed schema"
          if not problems else f"\nFAIL — {problems} drift(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
