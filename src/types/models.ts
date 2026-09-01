// Filter & grouping types

export type GroupMode = 'none' | 'project' | 'model';
export type DatePreset = 'all' | '1h' | '24h' | '7d' | '30d' | 'custom';

export interface FilterState {
  searchQuery: string;
  selectedModels: string[];
  /**
   * Provider ids to include. Empty means all, which is what a single-provider machine always sees.
   * Filtering by provider is a first-class filter rather than a special case of the model filter, because
   * two providers can serve the same model and a user narrowing to "Codex" means the agent, not the model.
   */
  selectedProviders: string[];
  datePreset: DatePreset;
  customDateFrom?: number;
  customDateTo?: number;
  groupMode: GroupMode;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  searchQuery: '',
  selectedModels: [],
  selectedProviders: [],
  datePreset: 'all',
  groupMode: 'none',
};

// Core data models ported from Go

export interface HistoryEntry {
  display: string;
  timestamp: number;
  project: string;
  sessionId: string;
}

export interface SessionSummary {
  sessionId: string;
  /** Which agent produced this session. The UI labels and filters on this, never branches on it. */
  providerId: string;
  /** Human label for the provider, supplied by its adapter so the UI never maps ids to names itself. */
  providerName: string;
  prompt: string;
  project: string;
  model: string;
  timestamp: Date;
  lastModified: Date;
  isActive: boolean;
}

export interface DashboardStats {
  totalSessions: number;
  activeSessions: number;
  totalCost: number;
  costByModel: Record<string, number>;
  costByProject: Record<string, number>;
  modelUsage: Record<string, number>;
  recentSessions: SessionSummary[];
}

export interface SessionDetail {
  sessionId: string;
  providerId: string;
  providerName: string;
  /**
   * What the provider can actually tell us. The UI shows or hides panels from these flags rather than from the
   * provider id, so a provider that exposes no cost shows no cost panel instead of a convincing zero.
   */
  capabilities: SessionCapabilities;
  prompt: string;
  project: string;
  model: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  totalCost: number;
  steps: Step[];
  subagents: SubagentInfo[];
  filesRead: string[];
  filesWritten: string[];
  toolsUsed: Record<string, number>;
  analysis?: AnalysisResult;
}

/** Mirrors AgentSessionCapabilities for the view layer, which must not import the adapter contract. */
export interface SessionCapabilities {
  shellCommands: boolean;
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

export type StepType = 'thinking' | 'tool_call' | 'text' | 'error' | 'subagent';

export interface Step {
  index: number;
  type: StepType;
  timestamp: Date;
  uuid: string;
  messageId: string;
  content: string;
  toolName?: string;
  toolInput?: any;
  toolResult?: string;
  toolSuccess?: boolean;
  usage?: Usage;
  /** undefined when the model is unknown or the source reported no usage. Zero means the source said zero. */
  cost?: number;
  agentId?: string;
  globalIndex?: number;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface SubagentInfo {
  agentId: string;
  prompt: string;
  model: string;
  agentType?: string;
  description?: string;
  parentStepIndex?: number;
  startTime?: Date;
  endTime?: Date;
  durationMs?: number;
  filesRead?: string[];
  filesWritten?: string[];
  toolsUsed?: Record<string, number>;
  stepCount: number;
  totalCost: number;
  steps: Step[];
  analysis?: AnalysisResult;
}

/**
 * Build a single chronological step list combining the main session and any
 * sub-agents. Each agent's steps are inserted right after the Task tool_use
 * that spawned them. `globalIndex` is assigned in iteration order so callers
 * have a stable, unique identifier for navigation/highlighting.
 */
export function flattenSessionSteps(session: SessionDetail): Step[] {
  const spawnedAt = new Map<number, SubagentInfo[]>();
  for (const sub of session.subagents) {
    if (typeof sub.parentStepIndex === 'number') {
      const arr = spawnedAt.get(sub.parentStepIndex) ?? [];
      arr.push(sub);
      spawnedAt.set(sub.parentStepIndex, arr);
    }
  }

  const out: Step[] = [];
  const push = (s: Step, agentId?: string) => {
    out.push({ ...s, agentId: agentId ?? s.agentId, globalIndex: out.length });
  };

  for (const main of session.steps) {
    push(main);
    const subs = spawnedAt.get(main.index);
    if (!subs) continue;
    for (const sub of subs) {
      for (const sStep of sub.steps) {
        push(sStep, sub.agentId);
      }
    }
  }

  // Orphan agents (no resolvable parent step) — append at the tail so they
  // remain visible rather than disappearing entirely.
  for (const sub of session.subagents) {
    if (typeof sub.parentStepIndex !== 'number') {
      for (const sStep of sub.steps) {
        push(sStep, sub.agentId);
      }
    }
  }

  return out;
}

export interface AnalysisResult {
  findings: Finding[];
  totalCost: number;
  wastedCost: number;
  efficiency: number; // percentage
  stepCosts: StepCost[];
  dependencies?: StepDependency[];
  contextMetrics?: ContextMetrics;
}

export interface ContextMetrics {
  peakInputTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheRead: number;
  totalCacheCreation: number;
  cacheHitRatio: number;
  compactionCount: number;
  avgTokensPerStep: number;
  tokenBurnRate: number;
  contextPressureZones: number[];
  compactionPoints: number[];
}

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  rule: string;
  severity: Severity;
  title: string;
  description: string;
  steps: number[];
  wastedCost: number;
  details?: any;
  confidence?: number;
  category?: string;
}

export interface StepDependency {
  fromStep: number;
  toStep: number;
  filePath: string;
  type: string;
}

export interface StepCost {
  stepIndex: number;
  /** undefined when no step in the session could be costed. */
  cost?: number;
}

// Pricing lived here as a hardcoded Claude-only table, duplicated by a second copy in parserService.ts.
// Both disagreed with published rates and both fell back to Sonnet pricing for unrecognized models, so a
// non-Anthropic session would have been costed at Anthropic rates. Cost now resolves through
// src/core/pricing/pricingProvider.ts, which returns undefined rather than guessing. Finding F5.
