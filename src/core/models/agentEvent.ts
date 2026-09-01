/**
 * The normalized event model.
 *
 * A discriminated union on a literal `kind`, never a bag of optional fields that callers probe. See
 * .archcore/specs/type-discriminators.spec.md for why: optional-field discrimination makes two event classes
 * indistinguishable to the compiler, and the error then surfaces as a rendering bug rather than a type error.
 */

export type AgentProviderId = 'claude-code' | 'openai-codex' | 'hermes' | (string & {});

/**
 * How much to trust a field.
 *
 * The three providers differ exactly here, which is why this is on every event rather than documented somewhere.
 * Codex rollouts carry a type discriminant that maps almost directly onto this union, so most Codex events are
 * `exact`. Hermes rows are OpenAI-chat-shaped, so session lifecycle, subagent attribution and dependency edges
 * are inferred and must never be marked `exact`.
 */
export type Confidence = 'exact' | 'derived' | 'heuristic';

export interface BaseAgentEvent {
  id: string;
  sessionId: string;
  providerId: AgentProviderId;

  timestamp?: string;
  /** Position in the session. Always present, because ordering must survive a source with no timestamps. */
  sequence: number;

  parentEventId?: string;
  /** Links a call to its result across records, where the source provides such an id. */
  correlationId?: string;

  /** The provider's own type string, kept so an unrecognized record is still inspectable. */
  rawType?: string;
  sourceOffset?: number;

  confidence?: Confidence;

  /** Provider-specific data. Namespaced so a normalized type never has to widen to carry it. */
  extensions?: Record<string, unknown>;
}

export interface UserMessageEvent extends BaseAgentEvent { kind: 'message.user'; text: string; }
export interface AssistantMessageEvent extends BaseAgentEvent { kind: 'message.assistant'; text: string; model?: string; }

/**
 * Model reasoning. Parsed, never dropped — dropping it hides parse failures and makes sequence numbering lie —
 * but masked in the UI and placeholdered in exports by default.
 * See .archcore/adr/reasoning-parse-then-gate.adr.md.
 */
export interface ReasoningEvent extends BaseAgentEvent { kind: 'reasoning'; text: string; tokens?: number; }

export interface ToolCallEvent extends BaseAgentEvent { kind: 'tool.call'; toolName: string; arguments?: unknown; }
export interface ToolResultEvent extends BaseAgentEvent {
  kind: 'tool.result';
  toolName?: string;
  result?: unknown;
  isError?: boolean;
}

export type ShellStatus = 'requested' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';

export interface ShellCommandEvent extends BaseAgentEvent {
  kind: 'shell.command';
  command: string;
  argv?: string[];
  cwd?: string;
  toolName?: string;
  exitCode?: number;
  /** Only set where the source actually captured it. Absent means not captured, not empty. */
  stdout?: string;
  stderr?: string;
  durationMs?: number;
  status?: ShellStatus;
}

export interface FileOperationEvent extends BaseAgentEvent {
  kind: 'file.read' | 'file.write' | 'file.edit';
  path: string;
  beforeHash?: string;
  afterHash?: string;
  bytesRead?: number;
  bytesWritten?: number;
  /** Whether the source retained the content, as distinct from whether content existed. */
  contentCaptured?: boolean;
}

export interface McpCallEvent extends BaseAgentEvent {
  kind: 'mcp.call';
  server?: string;
  tool: string;
  arguments?: unknown;
  result?: unknown;
  status?: 'succeeded' | 'failed' | 'unknown';
}

export interface NetworkToolEvent extends BaseAgentEvent { kind: 'network.tool'; toolName: string; url?: string; status?: number; }
export interface SubagentStartEvent extends BaseAgentEvent { kind: 'subagent.start'; subagentId: string; description?: string; }
export interface SubagentEndEvent extends BaseAgentEvent { kind: 'subagent.end'; subagentId: string; }

export interface TokenUsageEvent extends BaseAgentEvent {
  kind: 'usage.tokens';
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  model?: string;
  /** undefined when the model is unknown to the pricing table. Zero only when genuinely zero. */
  estimatedCostUsd?: number;
}

export interface ContextEvent extends BaseAgentEvent { kind: 'context.window'; usedTokens?: number; windowTokens?: number; }
export interface CompactionEvent extends BaseAgentEvent { kind: 'context.compaction'; reason?: string; }
export interface ErrorEvent extends BaseAgentEvent { kind: 'error'; message: string; recoverable?: boolean; }
export interface SessionLifecycleEvent extends BaseAgentEvent { kind: 'session.lifecycle'; phase: 'start' | 'resume' | 'end' | 'cancel'; }

/**
 * A record the adapter parsed but does not recognize.
 *
 * Unknown events are DATA, not errors. A parser that throws on an unrecognized record fails the moment a
 * provider ships a new event type, which they do without notice.
 */
export interface UnknownProviderEvent extends BaseAgentEvent { kind: 'provider.unknown'; payload: unknown; }

export type AgentEvent =
  | UserMessageEvent
  | AssistantMessageEvent
  | ReasoningEvent
  | ToolCallEvent
  | ToolResultEvent
  | ShellCommandEvent
  | FileOperationEvent
  | McpCallEvent
  | NetworkToolEvent
  | SubagentStartEvent
  | SubagentEndEvent
  | TokenUsageEvent
  | ContextEvent
  | CompactionEvent
  | ErrorEvent
  | SessionLifecycleEvent
  | UnknownProviderEvent;

export type AgentEventKind = AgentEvent['kind'];

/** Narrowing helper, so consumers filter by kind without repeating the predicate at every call site. */
export function isKind<K extends AgentEventKind>(event: AgentEvent, kind: K): event is Extract<AgentEvent, { kind: K }> {
  return event.kind === kind;
}
