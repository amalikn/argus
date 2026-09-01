import * as fs from 'fs';
import * as readline from 'readline';
import { AgentEvent } from '../../core/models/agentEvent';
import { AgentSession, AgentSourceDescriptor, ParseDiagnostic, emptySession } from '../../core/models/agentSession';
import { pricing } from '../../core/pricing/pricingProvider';
import {
  ExecCommandEndPayload,
  FunctionCallOutputPayload,
  FunctionCallPayload,
  MessagePayload,
  PatchApplyEndPayload,
  RolloutLine,
  SessionMetaPayload,
  TokenCountPayload,
  TurnContextPayload,
} from './types';

const PROVIDER = 'openai-codex';

/**
 * Parse a Codex rollout into the normalized model.
 *
 * STREAMED, not read whole: rollouts in the local store run from a few hundred KB to 45 MB, and holding one in
 * memory to parse it would be the single largest allocation the extension makes.
 *
 * Codex is the easier of the two new providers because it carries a real discriminant. `type` plus
 * `payload.type` identify a record exactly, so most events are marked `exact` rather than derived — the
 * opposite of Hermes, whose chat-shaped rows force inference.
 */

function textOf(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object') {
          const p = part as Record<string, unknown>;
          return typeof p.text === 'string' ? p.text : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function commandOf(command: string | string[] | undefined): string | undefined {
  if (typeof command === 'string') {
    return command;
  }
  if (Array.isArray(command)) {
    return command.join(' ');
  }
  return undefined;
}

/** Durations arrive in more than one shape across versions; accept what we recognize and ignore the rest. */
function durationMs(duration: unknown): number | undefined {
  if (typeof duration === 'number') {
    return duration;
  }
  if (duration && typeof duration === 'object') {
    const d = duration as Record<string, unknown>;
    if (typeof d.secs === 'number') {
      return d.secs * 1000 + (typeof d.nanos === 'number' ? d.nanos / 1e6 : 0);
    }
  }
  return undefined;
}

export interface CodexParseResult {
  session: AgentSession;
}

export async function parseRollout(
  filePath: string,
  sessionId: string,
  source: AgentSourceDescriptor
): Promise<AgentSession> {
  const session = emptySession(sessionId, PROVIDER, source);
  const diagnostics: ParseDiagnostic[] = [];
  const events: AgentEvent[] = [];

  let sequence = 0;
  let malformed = 0;
  let sawExec = false;
  let sawExecOutput = false;
  let sawPatch = false;
  let sawReasoning = false;
  let sawMcp = false;
  let sawUsage = false;
  let sawSubagent = false;
  let contextWindow: number | undefined;
  let latestUsage: TokenCountPayload['info'] | undefined;

  // A function_call and its function_call_output are separated by other records and correlated by call_id.
  const pendingCalls = new Map<string, string>();

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) {
      continue;
    }

    let record: RolloutLine;
    try {
      record = JSON.parse(line) as RolloutLine;
    } catch {
      // A corrupt or half-written line is data loss for that record only. Counting them and continuing is the
      // difference between a session that renders with a gap and a session that fails to open at all.
      malformed += 1;
      continue;
    }

    const seq = sequence++;
    const base = {
      id: `${sessionId}:${seq}`,
      sessionId,
      providerId: PROVIDER,
      sequence: seq,
      timestamp: record.timestamp,
      rawType: `${record.type ?? '?'}/${(record.payload as any)?.type ?? ''}`,
    };
    const payload = (record.payload ?? {}) as Record<string, unknown>;
    const payloadType = typeof payload.type === 'string' ? payload.type : undefined;

    if (record.type === 'session_meta') {
      const meta = payload as SessionMetaPayload;
      session.cwd = meta.cwd;
      session.projectPath = meta.cwd;
      session.startedAt = meta.timestamp ?? record.timestamp;
      session.modelProvider = meta.model_provider;
      session.source = { ...session.source, clientName: meta.originator ?? 'Codex', clientVersion: meta.cli_version };
      events.push({ ...base, kind: 'session.lifecycle', phase: 'start', confidence: 'exact' });
      continue;
    }

    if (record.type === 'turn_context') {
      const turn = payload as TurnContextPayload;
      // The model can change mid-session when the user switches it; the last one seen is the current one.
      session.model = turn.model ?? session.model;
      session.cwd = session.cwd ?? turn.cwd;
      continue;
    }

    switch (payloadType) {
      case 'user_message':
        events.push({ ...base, kind: 'message.user', text: String(payload.message ?? ''), confidence: 'exact' });
        break;

      case 'agent_message':
        events.push({ ...base, kind: 'message.assistant', text: String(payload.message ?? ''), model: session.model, confidence: 'exact' });
        break;

      case 'message': {
        const msg = payload as MessagePayload;
        const text = textOf(msg.content);
        if (text) {
          events.push({
            ...base,
            kind: msg.role === 'user' ? 'message.user' : 'message.assistant',
            text,
            confidence: 'exact',
          });
        }
        break;
      }

      case 'reasoning': {
        sawReasoning = true;
        // Parsed and kept; masked at render and placeholdered in default exports.
        const text = textOf((payload as any).content) || textOf((payload as any).summary);
        events.push({ ...base, kind: 'reasoning', text, confidence: 'exact' });
        break;
      }

      case 'exec_command_end': {
        const exec = payload as ExecCommandEndPayload;
        const command = commandOf(exec.command);
        if (command !== undefined) {
          sawExec = true;
          if (exec.aggregated_output) {
            sawExecOutput = true;
          }
          events.push({
            ...base,
            kind: 'shell.command',
            command,
            cwd: exec.cwd,
            correlationId: exec.call_id,
            exitCode: exec.exit_code,
            // Codex records the exit code, so status is READ rather than inferred. Claude does not, which is
            // why the same field is `derived` there and `exact` here.
            status: exec.exit_code === undefined ? 'unknown' : exec.exit_code === 0 ? 'succeeded' : 'failed',
            stdout: exec.aggregated_output,
            durationMs: durationMs(exec.duration),
            confidence: 'exact',
          });
        }
        break;
      }

      case 'patch_apply_end': {
        const patch = payload as PatchApplyEndPayload;
        sawPatch = true;
        for (const [path, change] of Object.entries(patch.changes ?? {})) {
          const kind = change?.type === 'add' ? 'file.write' : change?.type === 'delete' ? 'file.write' : 'file.edit';
          events.push({
            ...base,
            id: `${base.id}:${path}`,
            kind,
            path,
            correlationId: patch.call_id,
            // A unified diff is a record of the change, not the resulting content.
            contentCaptured: Boolean(change?.unified_diff),
            confidence: 'exact',
          });
        }
        break;
      }

      case 'function_call':
      case 'custom_tool_call': {
        const call = payload as FunctionCallPayload;
        const name = call.name ?? 'unknown';
        if (call.call_id) {
          pendingCalls.set(call.call_id, name);
        }
        if (name.startsWith('mcp')) {
          sawMcp = true;
          const [, server, tool] = name.split('__');
          events.push({
            ...base,
            kind: 'mcp.call',
            server,
            tool: tool ?? name,
            arguments: call.arguments,
            correlationId: call.call_id,
            confidence: 'exact',
          });
        } else {
          events.push({ ...base, kind: 'tool.call', toolName: name, arguments: call.arguments, correlationId: call.call_id, confidence: 'exact' });
        }
        break;
      }

      case 'function_call_output':
      case 'custom_tool_call_output': {
        const out = payload as FunctionCallOutputPayload;
        events.push({
          ...base,
          kind: 'tool.result',
          toolName: out.call_id ? pendingCalls.get(out.call_id) : undefined,
          result: out.output,
          correlationId: out.call_id,
          confidence: 'exact',
        });
        break;
      }

      case 'token_count': {
        const counts = payload as TokenCountPayload;
        if (counts.info) {
          sawUsage = true;
          latestUsage = counts.info;
          contextWindow = counts.info.model_context_window ?? contextWindow;
          const last = counts.info.last_token_usage ?? {};
          events.push({
            ...base,
            kind: 'usage.tokens',
            inputTokens: last.input_tokens,
            outputTokens: last.output_tokens,
            cachedInputTokens: last.cached_input_tokens,
            model: session.model,
            estimatedCostUsd: pricing.calculateCost(
              {
                input_tokens: last.input_tokens,
                output_tokens: last.output_tokens,
                cache_read_input_tokens: last.cached_input_tokens,
              },
              session.model
            ),
            confidence: 'exact',
          });
        }
        break;
      }


      case 'item_completed': {
        // SECOND FORMAT GENERATION.
        //
        // Codex builds from 2026-08 onward stop emitting exec_command_end, patch_apply_end and the bare
        // message payloads, and wrap everything in item_completed with a typed `item`. Both generations exist
        // side by side in a real store — a machine that has used Codex for months has rollouts in each — so the
        // adapter reads both rather than choosing. This is the schema evolution the plan warned about, found in
        // the local store rather than in a changelog.
        const item = (payload.item ?? {}) as Record<string, unknown>;
        const itemType = typeof item.type === 'string' ? item.type : undefined;
        const itemBase = { ...base, rawType: `item_completed/${itemType ?? '?'}` };

        switch (itemType) {
          case 'UserMessage':
            events.push({ ...itemBase, kind: 'message.user', text: textOf(item.content), confidence: 'exact' });
            break;

          case 'AgentMessage':
            events.push({ ...itemBase, kind: 'message.assistant', text: textOf(item.content), model: session.model, confidence: 'exact' });
            break;

          case 'Reasoning': {
            sawReasoning = true;
            const text = textOf(item.raw_content) || textOf(item.summary_text);
            events.push({ ...itemBase, kind: 'reasoning', text, confidence: 'exact' });
            break;
          }

          case 'CommandExecution': {
            const command = commandOf(item.command as string | string[] | undefined);
            if (command !== undefined) {
              sawExec = true;
              const output = typeof item.aggregated_output === 'string' ? item.aggregated_output : undefined;
              if (output) {
                sawExecOutput = true;
              }
              const exit = typeof item.exit_code === 'number' ? item.exit_code : undefined;
              events.push({
                ...itemBase,
                kind: 'shell.command',
                command,
                cwd: typeof item.cwd === 'string' ? item.cwd : undefined,
                exitCode: exit,
                status: exit === undefined ? 'unknown' : exit === 0 ? 'succeeded' : 'failed',
                stdout: output ?? (typeof item.stdout === 'string' ? item.stdout : undefined),
                stderr: typeof item.stderr === 'string' ? item.stderr : undefined,
                durationMs: durationMs(item.duration),
                confidence: 'exact',
              });
            }
            break;
          }

          case 'FileChange': {
            sawPatch = true;
            const changes = (item.changes ?? {}) as Record<string, { type?: string }>;
            for (const [changedPath, change] of Object.entries(changes)) {
              events.push({
                ...itemBase,
                id: `${itemBase.id}:${changedPath}`,
                kind: change?.type === 'add' || change?.type === 'delete' ? 'file.write' : 'file.edit',
                path: changedPath,
                contentCaptured: false,
                confidence: 'exact',
              });
            }
            break;
          }

          case 'ContextCompaction':
            events.push({ ...itemBase, kind: 'context.compaction', confidence: 'exact' });
            break;

          case 'SubAgentActivity':
            // Newer Codex delegates to sub-agents. The rollout records the activity but not a matching end
            // event, so the session is marked as having subagents without claiming a lifecycle it cannot see.
            sawSubagent = true;
            events.push({
              ...itemBase,
              kind: 'subagent.start',
              subagentId: String(item.agent_thread_id ?? item.id ?? itemBase.id),
              description: typeof item.agent_path === 'string' ? item.agent_path : undefined,
              confidence: 'exact',
            });
            break;

          case 'CollabAgentToolCall':
            sawSubagent = true;
            events.push({
              ...itemBase,
              kind: 'tool.call',
              toolName: String(item.tool ?? 'collab'),
              arguments: item.receiver_agents,
              confidence: 'exact',
            });
            break;

          default:
            events.push({ ...itemBase, kind: 'provider.unknown', payload: item, confidence: 'exact' });
            break;
        }
        break;
      }

      case 'task_complete':
        events.push({ ...base, kind: 'session.lifecycle', phase: 'end', confidence: 'exact' });
        session.endedAt = record.timestamp;
        break;

      default:
        // Unknown records are DATA. A provider that ships a new event type must not break the session.
        if (payloadType) {
          events.push({ ...base, kind: 'provider.unknown', payload, confidence: 'exact' });
        }
        break;
    }
  }

  rl.close();

  if (malformed > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'malformed-lines',
      message: `${malformed} line(s) could not be parsed and were skipped`,
    });
  }
  if (events.length === 0) {
    diagnostics.push({ severity: 'warning', code: 'empty-session', message: 'no parseable records in rollout' });
  }

  session.events = events;
  session.diagnostics = diagnostics;
  session.updatedAt = session.endedAt ?? events.at(-1)?.timestamp;

  const total = latestUsage?.total_token_usage;
  session.metrics = {
    inputTokens: total?.input_tokens,
    outputTokens: total?.output_tokens,
    cachedInputTokens: total?.cached_input_tokens,
    totalTokens: total?.total_tokens,
    contextWindowTokens: contextWindow,
    estimatedCostUsd: pricing.calculateCost(
      {
        input_tokens: total?.input_tokens,
        output_tokens: total?.output_tokens,
        cache_read_input_tokens: total?.cached_input_tokens,
      },
      session.model
    ),
  };

  // Capabilities are reported from what this session actually CONTAINED, not from what Codex can do in
  // principle. A session with no shell command should not offer a shell view.
  session.capabilities = {
    liveWatch: true,
    prompts: true,
    assistantMessages: true,
    shellCommands: sawExec,
    shellOutput: sawExecOutput,
    // Codex records file changes only through patch application; there is no read event in the rollout.
    fileReads: false,
    fileWrites: sawPatch,
    fileEdits: sawPatch,
    mcpCalls: sawMcp,
    // Present only in the newer format, which records SubAgentActivity and CollabAgentToolCall.
    subagents: sawSubagent,
    tokenUsage: sawUsage,
    cost: sawUsage && pricing.hasPricing(session.model),
    contextMetrics: contextWindow !== undefined,
    reasoningMetadata: sawReasoning,
  };

  return session;
}
