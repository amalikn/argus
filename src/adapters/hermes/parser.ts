import * as fs from 'fs';
import * as readline from 'readline';
import { AgentEvent, Confidence } from '../../core/models/agentEvent';
import { AgentSession, AgentSourceDescriptor, ParseDiagnostic, emptySession } from '../../core/models/agentSession';
import { pricing } from '../../core/pricing/pricingProvider';

const PROVIDER = 'hermes';

/**
 * Parse Hermes evidence into the normalized model.
 *
 * Two formats, both handled: the `session_*.json` snapshot (primary — 243 files and 119.9 MB in the audited
 * store, carrying an explicit session_id, session_start, last_updated and message_count) and the `*.jsonl`
 * mirror (secondary — 60 files, no embedded id, useful for live tailing). See
 * .archcore/adr/hermes-snapshot-is-primary.adr.md and docs/adapters/hermes-source-audit.md.
 *
 * CONFIDENCE IS LOWER HERE THAN FOR THE OTHER TWO PROVIDERS, and deliberately so. Hermes rows are
 * OpenAI-chat-shaped, so a tool call says only that a function named `terminal` was invoked; that it is a shell
 * execution is our inference from the name. Exit codes ARE recorded in the result payload, so command status is
 * exact even though the command's classification is derived.
 */

/** Tool-name vocabulary observed across the audited store, grouped by what the call actually did. */
const SHELL_TOOLS = new Set(['terminal', 'bash', 'execute_code', 'process']);
const READ_TOOLS = new Set(['read_file']);
const WRITE_TOOLS = new Set(['write_file']);
const EDIT_TOOLS = new Set(['patch', 'skill_patch']);
const NETWORK_TOOLS = new Set([
  'browser_navigate', 'browser_snapshot', 'browser_click', 'browser_console', 'browser_scroll',
  'browser_type', 'browser_vision', 'browser_get_images', 'web_search', 'web_extract', 'web_scraper',
]);
/** The only subagent evidence Hermes leaves. There is no lifecycle record to pair it with. */
const DELEGATION_TOOLS = new Set(['delegate_task']);

interface HermesToolCall {
  id?: string;
  call_id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface HermesMessage {
  role?: string;
  content?: unknown;
  timestamp?: string;
  finish_reason?: string;
  reasoning?: string;
  reasoning_content?: string;
  tool_calls?: HermesToolCall[];
  tool_call_id?: string;
  /** The writer spells this `name` on 8,625 records and `tool_name` on 6. Read both. */
  name?: string;
  tool_name?: string;
  /** Marks a record Hermes fabricated to recover from an empty model response. Not evidence of agent action. */
  _empty_recovery_synthetic?: boolean;
}

interface HermesSnapshot {
  session_id?: string;
  model?: string;
  base_url?: string;
  platform?: string;
  session_start?: string;
  last_updated?: string;
  system_prompt?: string;
  tools?: string[];
  message_count?: number;
  messages?: HermesMessage[];
}

function parseArgs(raw: string | undefined): unknown {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    // Arguments are a JSON string in the source; a model can emit a malformed one. Keep the raw text rather
    // than dropping the call, because the call still happened.
    return raw;
  }
}

/** Tool results are a JSON string carrying output, exit_code, success, error and file metadata. */
function parseResult(content: unknown): Record<string, unknown> | undefined {
  if (typeof content !== 'string' || !content.startsWith('{')) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function pathFrom(args: unknown): string | undefined {
  if (args && typeof args === 'object') {
    const o = args as Record<string, unknown>;
    for (const key of ['path', 'file_path', 'filePath', 'file']) {
      if (typeof o[key] === 'string') {
        return o[key] as string;
      }
    }
  }
  return undefined;
}


/**
 * Keys any client might use to persist the token counts its model provider returned.
 *
 * IMPORTANT DISTINCTION. Tokens are consumed on every Hermes turn - it calls a model API, and the sessions record
 * `model` and `base_url` to prove it. What the audited store contains is no record of the counts the provider
 * returned: Hermes does not persist them. So `tokenUsage: false` means "this client discards the usage response",
 * NOT "no tokens were used". The counts exist upstream at the model provider; they are simply not in the evidence
 * this tool reads.
 *
 * That framing decides what a fix looks like. It is a Hermes logging gap, closable by Hermes persisting what it
 * already receives - so the adapter LOOKS on every record rather than hard-coding the absence, and the flag flips on
 * its own the day that changes. See docs/adapters/hermes-source-audit.md.
 */
const USAGE_KEYS = [
  'usage', 'token_usage', 'tokens', 'prompt_tokens', 'completion_tokens',
  'input_tokens', 'output_tokens', 'total_tokens', 'cached_input_tokens',
] as const;

const CONTEXT_WINDOW_KEYS = ['model_context_window', 'context_window', 'max_context_tokens'] as const;

/** Read token counts off a record if any provider-shaped usage field is present. */
function usageFrom(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const nested = record.usage ?? record.token_usage;
  if (nested && typeof nested === 'object') {
    return nested as Record<string, unknown>;
  }
  for (const key of USAGE_KEYS) {
    if (typeof record[key] === 'number') {
      return record;
    }
  }
  return undefined;
}

interface Accumulator {
  events: AgentEvent[];
  diagnostics: ParseDiagnostic[];
  sequence: number;
  callNames: Map<string, string>;
  sawShell: boolean;
  sawShellOutput: boolean;
  sawRead: boolean;
  sawWrite: boolean;
  sawEdit: boolean;
  sawNetwork: boolean;
  sawDelegation: boolean;
  sawReasoning: boolean;
  sawUsage: boolean;
  contextWindow?: number;
}

function newAccumulator(): Accumulator {
  return {
    events: [], diagnostics: [], sequence: 0, callNames: new Map(),
    sawShell: false, sawShellOutput: false, sawRead: false, sawWrite: false,
    sawEdit: false, sawNetwork: false, sawDelegation: false, sawReasoning: false, sawUsage: false,
  };
}

function addMessage(acc: Accumulator, message: HermesMessage, sessionId: string): void {
  const seq = acc.sequence++;
  const base = {
    id: `${sessionId}:${seq}`,
    sessionId,
    providerId: PROVIDER,
    sequence: seq,
    timestamp: message.timestamp,
    rawType: message.role,
  };

  // A synthetic recovery record is something Hermes fabricated, not something the agent did. Rendering it as an
  // assistant message would put an invented turn in a forensic timeline, so it is preserved as unknown instead.
  if (message._empty_recovery_synthetic) {
    acc.events.push({ ...base, kind: 'provider.unknown', payload: message, confidence: 'exact' as Confidence });
    return;
  }

  const text = typeof message.content === 'string' ? message.content : '';

  if (message.role === 'user') {
    acc.events.push({ ...base, kind: 'message.user', text, confidence: 'exact' as Confidence });
    return;
  }

  if (message.role === 'tool') {
    const name = message.name ?? message.tool_name ?? (message.tool_call_id ? acc.callNames.get(message.tool_call_id) : undefined);
    const result = parseResult(message.content);
    const exitCode = typeof result?.exit_code === 'number' ? (result.exit_code as number) : undefined;

    if (name && SHELL_TOOLS.has(name)) {
      if (result?.output !== undefined || result?.error !== undefined) {
        acc.sawShellOutput = true;
      }
      // The command text lives on the CALL, not the result; the shell.command event was already emitted there.
      // This carries what the call could not know: the exit code and the output.
      acc.events.push({
        ...base,
        kind: 'tool.result',
        toolName: name,
        result: result ?? message.content,
        isError: exitCode !== undefined ? exitCode !== 0 : result?.success === false,
        correlationId: message.tool_call_id,
        confidence: 'exact' as Confidence,
        extensions: exitCode !== undefined ? { exitCode } : undefined,
      });
      return;
    }

    acc.events.push({
      ...base,
      kind: 'tool.result',
      toolName: name,
      result: result ?? message.content,
      isError: result?.success === false || result?.error !== undefined,
      correlationId: message.tool_call_id,
      confidence: 'exact' as Confidence,
    });
    return;
  }

  // Look for usage on every record, whatever its role. Absent in the audited store; detected rather than assumed.
  const usage = usageFrom(message as unknown as Record<string, unknown>);
  if (usage) {
    acc.sawUsage = true;
    acc.events.push({
      ...base,
      id: `${base.id}:usage`,
      kind: 'usage.tokens',
      inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined,
      outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined,
      cachedInputTokens: typeof usage.cached_input_tokens === 'number' ? usage.cached_input_tokens : undefined,
      confidence: 'exact' as Confidence,
    });
  }
  for (const key of CONTEXT_WINDOW_KEYS) {
    const value = (message as unknown as Record<string, unknown>)[key];
    if (typeof value === 'number') {
      acc.contextWindow = value;
    }
  }

  // assistant
  if (text) {
    acc.events.push({ ...base, kind: 'message.assistant', text, confidence: 'exact' as Confidence });
  }

  const reasoning = message.reasoning_content || message.reasoning;
  if (reasoning) {
    acc.sawReasoning = true;
    // Parsed and kept. Masking happens at render and export, never at parse.
    acc.events.push({
      ...base, id: `${base.id}:reasoning`, kind: 'reasoning', text: reasoning, confidence: 'exact' as Confidence,
    });
  }

  for (const call of message.tool_calls ?? []) {
    const name = call.function?.name ?? 'unknown';
    const callId = call.call_id ?? call.id;
    if (callId) {
      acc.callNames.set(callId, name);
    }
    const args = parseArgs(call.function?.arguments);
    const callBase = { ...base, id: `${base.id}:${callId ?? name}`, correlationId: callId };

    if (SHELL_TOOLS.has(name)) {
      acc.sawShell = true;
      const command = args && typeof args === 'object' ? (args as any).command ?? (args as any).code : undefined;
      acc.events.push({
        ...callBase,
        kind: 'shell.command',
        command: typeof command === 'string' ? command : JSON.stringify(args ?? {}),
        toolName: name,
        // The result record carries the exit code; at call time the outcome is genuinely not yet known.
        status: 'requested',
        // DERIVED, not exact: Hermes says a function named `terminal` was called. That it is a shell execution
        // is our inference from the name, not something the record states.
        confidence: 'derived' as Confidence,
      });
      continue;
    }

    if (READ_TOOLS.has(name) || WRITE_TOOLS.has(name) || EDIT_TOOLS.has(name)) {
      const path = pathFrom(args);
      if (path) {
        if (READ_TOOLS.has(name)) { acc.sawRead = true; }
        if (WRITE_TOOLS.has(name)) { acc.sawWrite = true; }
        if (EDIT_TOOLS.has(name)) { acc.sawEdit = true; }
        acc.events.push({
          ...callBase,
          kind: READ_TOOLS.has(name) ? 'file.read' : WRITE_TOOLS.has(name) ? 'file.write' : 'file.edit',
          path,
          confidence: 'derived' as Confidence,
        });
        continue;
      }
    }

    if (NETWORK_TOOLS.has(name)) {
      acc.sawNetwork = true;
      const url = args && typeof args === 'object' ? (args as any).url : undefined;
      acc.events.push({
        ...callBase, kind: 'network.tool', toolName: name,
        url: typeof url === 'string' ? url : undefined, confidence: 'derived' as Confidence,
      });
      continue;
    }

    if (DELEGATION_TOOLS.has(name)) {
      acc.sawDelegation = true;
      // HEURISTIC, the weakest marker in the vocabulary. Hermes records the delegation call and nothing else:
      // no subagent id, no lifecycle, and state.db async_delegations was empty in the audited store. Calling
      // this a subagent is an interpretation of a tool name.
      acc.events.push({
        ...callBase, kind: 'subagent.start',
        subagentId: callId ?? `${sessionId}:${seq}`,
        description: typeof (args as any)?.agent === 'string' ? (args as any).agent : undefined,
        confidence: 'heuristic' as Confidence,
      });
      continue;
    }

    acc.events.push({ ...callBase, kind: 'tool.call', toolName: name, arguments: args, confidence: 'exact' as Confidence });
  }
}

function finish(session: AgentSession, acc: Accumulator): AgentSession {
  session.events = acc.events;
  session.diagnostics = acc.diagnostics;
  session.capabilities = {
    liveWatch: true,
    prompts: true,
    assistantMessages: true,
    shellCommands: acc.sawShell,
    shellOutput: acc.sawShellOutput,
    fileReads: acc.sawRead,
    fileWrites: acc.sawWrite,
    fileEdits: acc.sawEdit,
    mcpCalls: false,
    subagents: acc.sawDelegation,
    // DERIVED, not asserted. No record in the store audited on 20260901 persisted the usage its model provider
    // returned, so in practice these are false for every Hermes session today. That is a statement about what
    // HERMES RECORDS, not about what was consumed: every turn calls a model and spends tokens. The adapter looks
    // on every record rather than hard-coding the absence, so the flag flips the day Hermes starts persisting them.
    //
    // Cost needs BOTH counts and a priceable model. deepseek-v4-flash, which Hermes runs, IS in the vendored table -
    // so the missing half is the counts, and it is missing at the client rather than at the price list.
    tokenUsage: acc.sawUsage,
    cost: acc.sawUsage && pricing.hasPricing(session.model),
    contextMetrics: acc.contextWindow !== undefined,
    reasoningMetadata: acc.sawReasoning,
  };
  // Metrics stay undefined unless something was actually read. undefined means the source does not expose it;
  // zero would mean it reported zero, and those are different claims.
  session.metrics = { contextWindowTokens: acc.contextWindow };
  return session;
}

/** Parse the primary snapshot form, `sessions/session_*.json`. */
export async function parseSnapshot(filePath: string, source: AgentSourceDescriptor): Promise<AgentSession> {
  const raw = await fs.promises.readFile(filePath, 'utf8');
  const snapshot = JSON.parse(raw) as HermesSnapshot;

  // The id comes from the RECORD. In the audited store 76 of 243 filenames disagreed with the embedded
  // session_id, so keying on the filename would mis-identify nearly a third of the store.
  const sessionId = snapshot.session_id ?? filePath.replace(/^.*\//, '').replace(/^session_|\.json$/g, '');
  const session = emptySession(sessionId, PROVIDER, source);
  const acc = newAccumulator();

  session.model = snapshot.model || undefined;
  session.startedAt = snapshot.session_start;
  session.updatedAt = snapshot.last_updated;
  session.title = snapshot.platform ? `${snapshot.platform} session` : undefined;
  session.source = { ...session.source, clientName: snapshot.platform ? `Hermes (${snapshot.platform})` : 'Hermes' };

  if (!snapshot.session_id) {
    acc.diagnostics.push({
      severity: 'warning', code: 'session-id-from-filename',
      message: 'snapshot carries no session_id; id derived from the filename',
    });
  }

  const messages = snapshot.messages ?? [];
  // message_count matched len(messages) on all 243 audited files, so a mismatch means the file was truncated
  // or hand-edited. Free integrity assertion the format hands us.
  if (typeof snapshot.message_count === 'number' && snapshot.message_count !== messages.length) {
    acc.diagnostics.push({
      severity: 'warning', code: 'message-count-mismatch',
      message: `message_count says ${snapshot.message_count} but ${messages.length} messages are present`,
    });
  }
  if (messages.length === 0) {
    acc.diagnostics.push({ severity: 'warning', code: 'empty-session', message: 'snapshot carries no messages' });
  }

  for (const message of messages) {
    addMessage(acc, message, sessionId);
  }
  return finish(session, acc);
}

/**
 * Parse the secondary mirror form, `sessions/*.jsonl`.
 *
 * Two hazards this handles that the snapshot form does not have:
 *   - 7 of 60 audited files have NO session_meta header row and begin with content
 *   - some rows carry unescaped newlines inside a tool result, so one logical record spans several physical
 *     lines. A line-oriented parser drops those silently; this rejoins by accumulating until the buffer parses.
 */
export async function parseMirror(
  filePath: string,
  sessionId: string,
  source: AgentSourceDescriptor
): Promise<AgentSession> {
  const session = emptySession(sessionId, PROVIDER, source);
  const acc = newAccumulator();
  let rejoined = 0;
  let dropped = 0;
  let pending = '';

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const flush = (buffer: string): boolean => {
    try {
      const record = JSON.parse(buffer);
      if (record && typeof record === 'object') {
        if (record.role === 'session_meta') {
          session.model = record.model || session.model;
          session.startedAt = session.startedAt ?? record.timestamp;
          session.title = record.platform ? `${record.platform} session` : session.title;
          session.source = { ...session.source, clientName: record.platform ? `Hermes (${record.platform})` : 'Hermes' };
        } else {
          addMessage(acc, record as HermesMessage, sessionId);
        }
      }
      return true;
    } catch {
      return false;
    }
  };

  for await (const raw of rl) {
    const line = raw.trim();
    if (!line && !pending) {
      continue;
    }
    // Rejoin with an ESCAPED newline, not a raw one. The record was split because Hermes wrote a literal
    // newline inside a JSON string, and JSON forbids that: concatenating the physical lines back with a real
    // newline reproduces the same invalid document. Escaping it restores both validity and the original text.
    const candidate = pending ? `${pending}\\n${raw}` : raw;
    if (flush(candidate)) {
      if (pending) {
        rejoined += 1;
      }
      pending = '';
      continue;
    }
    // Not valid yet. Hold it and try again with the next line appended — that is what an unescaped newline
    // inside a payload looks like. Bounded so a genuinely corrupt line cannot swallow the rest of the file.
    pending = candidate;
    if (pending.length > 2_000_000) {
      dropped += 1;
      pending = '';
    }
  }
  if (pending) {
    // A trailing fragment is the normal shape of a file being written to right now.
    dropped += 1;
  }
  rl.close();

  if (rejoined > 0) {
    acc.diagnostics.push({
      severity: 'info', code: 'rejoined-continuation-lines',
      message: `${rejoined} record(s) spanned multiple physical lines and were rejoined`,
    });
  }
  if (dropped > 0) {
    acc.diagnostics.push({
      severity: 'warning', code: 'malformed-lines',
      message: `${dropped} record(s) could not be parsed and were skipped`,
    });
  }
  // A mirror with no header row is normal: 7 of 60 audited files have none.
  if (!session.model) {
    acc.diagnostics.push({
      severity: 'info', code: 'no-session-meta',
      message: 'mirror has no session_meta header; model and platform are unknown',
    });
  }

  return finish(session, acc);
}
