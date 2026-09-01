import { AgentEvent, AgentProviderId } from './agentEvent';
import { NORMALIZED_SCHEMA_VERSION } from './schema';

/** Where a session came from, in enough detail to find it again and to explain what was read. */
export interface AgentSourceDescriptor {
  providerId: AgentProviderId;
  clientName: string;
  clientVersion?: string;
  sourceKind: 'jsonl' | 'log' | 'sqlite' | 'otel' | 'api' | 'custom';
  sourcePath?: string;
  /** Named provider profile, where the provider supports more than the default one. */
  profile?: string;
}

/**
 * What a provider can actually tell us.
 *
 * The UI reads these rather than branching on provider id, so a provider that exposes no cost shows no cost
 * panel instead of a convincing zero. See .archcore/rules/no-provider-conditionals-downstream.rule.md.
 */
export interface AgentSessionCapabilities {
  liveWatch: boolean;
  prompts: boolean;
  assistantMessages: boolean;
  shellCommands: boolean;
  /** Whether command OUTPUT was captured, which is a different question from whether commands were recorded. */
  shellOutput: boolean;
  fileReads: boolean;
  fileWrites: boolean;
  fileEdits: boolean;
  mcpCalls: boolean;
  subagents: boolean;
  tokenUsage: boolean;
  cost: boolean;
  contextMetrics: boolean;
  reasoningMetadata: boolean;
}

/**
 * Session metrics.
 *
 * Every field is optional and that is load-bearing: `undefined` means the source does not expose it, `0` means
 * the source reported zero. Never default one to the other.
 */
export interface AgentSessionMetrics {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  contextWindowTokens?: number;
  peakContextTokens?: number;
  cacheHitRatio?: number;
}

/** Something the parser could not fully handle, surfaced rather than swallowed. */
export interface ParseDiagnostic {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  /** Byte offset or line number, where the parser can attribute the problem to a position. */
  at?: number;
}

export interface AgentSession {
  schemaVersion: number;

  id: string;
  providerId: AgentProviderId;
  source: AgentSourceDescriptor;

  title?: string;
  projectPath?: string;
  cwd?: string;
  workspaceName?: string;

  startedAt?: string;
  updatedAt?: string;
  endedAt?: string;

  model?: string;
  modelProvider?: string;

  /** Set where a session is a subagent of another. Claude stores these as sibling files, not inline records. */
  parentSessionId?: string;
  rootSessionId?: string;

  events: AgentEvent[];

  metrics?: AgentSessionMetrics;
  capabilities: AgentSessionCapabilities;

  /** Always present, even when empty: an absent diagnostics array and a clean parse are different claims. */
  diagnostics: ParseDiagnostic[];
}

/** An incremental update from a live watcher. Appending beats re-parsing a growing file on every write. */
export interface AgentSessionDelta {
  sessionId: string;
  appendedEvents: AgentEvent[];
  metrics?: AgentSessionMetrics;
  diagnostics?: ParseDiagnostic[];
  endedAt?: string;
}

/** Every capability off. Adapters turn on what they can actually prove, rather than starting optimistic. */
export const NO_CAPABILITIES: AgentSessionCapabilities = {
  liveWatch: false,
  prompts: false,
  assistantMessages: false,
  shellCommands: false,
  shellOutput: false,
  fileReads: false,
  fileWrites: false,
  fileEdits: false,
  mcpCalls: false,
  subagents: false,
  tokenUsage: false,
  cost: false,
  contextMetrics: false,
  reasoningMetadata: false,
};

/** Build an empty session with the current schema version, so no adapter has to remember to stamp it. */
export function emptySession(
  id: string,
  providerId: AgentProviderId,
  source: AgentSourceDescriptor,
  capabilities: Partial<AgentSessionCapabilities> = {}
): AgentSession {
  return {
    schemaVersion: NORMALIZED_SCHEMA_VERSION,
    id,
    providerId,
    source,
    events: [],
    capabilities: { ...NO_CAPABILITIES, ...capabilities },
    diagnostics: [],
  };
}
