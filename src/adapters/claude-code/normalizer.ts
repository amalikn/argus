import { AgentEvent, Confidence } from '../../core/models/agentEvent';
import { AgentSession, AgentSourceDescriptor, ParseDiagnostic, emptySession } from '../../core/models/agentSession';
import { SessionDetail, Step } from '../../types/models';
import { pricing } from '../../core/pricing/pricingProvider';

const PROVIDER = 'claude-code';

/**
 * Convert Claude's parsed session shape into the normalized model.
 *
 * Deliberately a PURE TRANSLATION over the output of the existing ParserService rather than a reimplementation
 * of the parse. Rewriting the parse and normalizing it in one step would make a parity failure ambiguous: it
 * could be the new parse or the new mapping, and the snapshots could not tell you which. The parse stays byte
 * for byte what it was; only the shape downstream of it changes.
 */

/** Tools whose calls are shell executions rather than generic tool calls. */
const SHELL_TOOLS = new Set(['Bash', 'BashOutput', 'KillShell']);
const READ_TOOLS = new Set(['Read', 'NotebookRead']);
const WRITE_TOOLS = new Set(['Write']);
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'NotebookEdit']);
const NETWORK_TOOLS = new Set(['WebFetch', 'WebSearch']);

function iso(d: Date | undefined): string | undefined {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : undefined;
}

/** Pull a path out of a tool input without assuming which key this tool used. */
function pathOf(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const o = input as Record<string, unknown>;
  for (const key of ['file_path', 'filePath', 'path', 'notebook_path']) {
    if (typeof o[key] === 'string') {
      return o[key] as string;
    }
  }
  return undefined;
}

function commandOf(input: unknown): string | undefined {
  if (input && typeof input === 'object' && typeof (input as any).command === 'string') {
    return (input as any).command;
  }
  return undefined;
}

/**
 * Map one Step to zero or more normalized events.
 *
 * A single Claude step can carry both a tool call and its result, so this returns an array. Confidence is
 * `exact` where the field was read straight off the record and `derived` where the shape was inferred from a
 * tool name — Claude does not label a Bash call as a shell execution, we recognize it.
 */
function usageEvent(step: Step, base: any): AgentEvent | undefined {
  if (!step.usage) {
    return undefined;
  }
  return {
    ...base,
    id: `${base.id}:usage`,
    kind: 'usage.tokens',
    inputTokens: step.usage.input_tokens,
    outputTokens: step.usage.output_tokens,
    cachedInputTokens: step.usage.cache_read_input_tokens,
    cacheWriteTokens: step.usage.cache_creation_input_tokens,
    // undefined here is meaningful and must survive: it means the model is unknown to the pricing table.
    estimatedCostUsd: step.cost,
    confidence: 'exact',
  };
}

function eventsForStep(step: Step, sessionId: string): AgentEvent[] {
  const base = {
    id: step.uuid || `${sessionId}:${step.index}`,
    sessionId,
    providerId: PROVIDER,
    sequence: step.index,
    timestamp: iso(step.timestamp),
    correlationId: step.messageId || undefined,
    rawType: step.type,
  };
  const out: AgentEvent[] = [];

  if (step.type === 'text') {
    out.push({ ...base, kind: 'message.assistant', text: step.content, confidence: 'exact' as Confidence });
    const u = usageEvent(step, base);
    if (u) { out.push(u); }
    return out;
  }
  if (step.type === 'thinking') {
    // Reasoning is parsed and kept. Masking happens at render and export, not here — dropping it at parse time
    // would hide parse failures. See .archcore/adr/reasoning-parse-then-gate.adr.md.
    out.push({ ...base, kind: 'reasoning', text: step.content, confidence: 'exact' as Confidence });
    const u = usageEvent(step, base);
    if (u) { out.push(u); }
    return out;
  }
  if (step.type === 'error') {
    out.push({ ...base, kind: 'error', message: step.content, confidence: 'exact' as Confidence });
    const u = usageEvent(step, base);
    if (u) { out.push(u); }
    return out;
  }
  if (step.type === 'subagent') {
    out.push({
      ...base,
      kind: 'subagent.start',
      subagentId: step.agentId ?? `${sessionId}:${step.index}`,
      description: step.content || undefined,
      confidence: 'derived' as Confidence,
    });
    return out;
  }

  // tool_call
  const tool = step.toolName ?? 'unknown';
  const path = pathOf(step.toolInput);
  const command = commandOf(step.toolInput);

  if (SHELL_TOOLS.has(tool) && command !== undefined) {
    out.push({
      ...base,
      kind: 'shell.command',
      command,
      toolName: tool,
      // Claude records the tool result but not an exit code, so status is inferred from success, not read.
      status: step.toolSuccess === undefined ? 'unknown' : step.toolSuccess ? 'succeeded' : 'failed',
      // Present only because the transcript captured it. Absent means not captured, not empty output.
      stdout: step.toolResult || undefined,
      confidence: 'derived' as Confidence,
    });
  } else if (path && (READ_TOOLS.has(tool) || WRITE_TOOLS.has(tool) || EDIT_TOOLS.has(tool))) {
    const kind = READ_TOOLS.has(tool) ? 'file.read' : WRITE_TOOLS.has(tool) ? 'file.write' : 'file.edit';
    out.push({
      ...base,
      kind,
      path,
      contentCaptured: Boolean(step.toolResult),
      confidence: 'derived' as Confidence,
    });
  } else if (NETWORK_TOOLS.has(tool)) {
    const url = step.toolInput && typeof step.toolInput === 'object' ? (step.toolInput as any).url : undefined;
    out.push({ ...base, kind: 'network.tool', toolName: tool, url, confidence: 'derived' as Confidence });
  } else if (tool.startsWith('mcp__')) {
    // Claude encodes MCP calls in the tool name as mcp__<server>__<tool>.
    const [, server, mcpTool] = tool.split('__');
    out.push({
      ...base,
      kind: 'mcp.call',
      server,
      tool: mcpTool ?? tool,
      arguments: step.toolInput,
      status: step.toolSuccess === undefined ? 'unknown' : step.toolSuccess ? 'succeeded' : 'failed',
      confidence: 'derived' as Confidence,
    });
  } else {
    out.push({ ...base, kind: 'tool.call', toolName: tool, arguments: step.toolInput, confidence: 'exact' as Confidence });
  }

  if (step.toolResult !== undefined && !SHELL_TOOLS.has(tool)) {
    out.push({
      ...base,
      id: `${base.id}:result`,
      kind: 'tool.result',
      toolName: tool,
      result: step.toolResult,
      isError: step.toolSuccess === false,
      confidence: 'exact' as Confidence,
    });
  }

  const usage = usageEvent(step, base);
  if (usage) {
    out.push(usage);
  }

  return out;
}

export function normalizeSession(
  detail: SessionDetail,
  source: AgentSourceDescriptor,
  diagnostics: ParseDiagnostic[] = []
): AgentSession {
  const session = emptySession(detail.sessionId, PROVIDER, source);

  session.title = detail.prompt || undefined;
  session.projectPath = detail.project || undefined;
  session.model = detail.model || undefined;
  session.modelProvider = detail.model ? 'anthropic' : undefined;
  session.startedAt = iso(detail.startTime);
  session.endedAt = iso(detail.endTime);
  session.updatedAt = iso(detail.endTime);
  session.diagnostics = diagnostics;

  session.events = detail.steps.flatMap((step) => eventsForStep(step, detail.sessionId));

  for (const sub of detail.subagents) {
    session.events.push(
      ...sub.steps.flatMap((step) => eventsForStep(step, sub.agentId)),
    );
  }

  const usageEvents = session.events.filter((e) => e.kind === 'usage.tokens') as Extract<AgentEvent, { kind: 'usage.tokens' }>[];
  const sum = (pick: (e: (typeof usageEvents)[number]) => number | undefined): number | undefined => {
    const values = usageEvents.map(pick).filter((v): v is number => v !== undefined);
    return values.length ? values.reduce((a, b) => a + b, 0) : undefined;
  };

  const costed = usageEvents.map((e) => e.estimatedCostUsd).filter((v): v is number => v !== undefined);

  session.metrics = {
    inputTokens: sum((e) => e.inputTokens),
    outputTokens: sum((e) => e.outputTokens),
    cachedInputTokens: sum((e) => e.cachedInputTokens),
    cacheWriteTokens: sum((e) => e.cacheWriteTokens),
    // undefined, not zero, when nothing in the session could be costed. The distinction is the whole point.
    estimatedCostUsd: costed.length ? costed.reduce((a, b) => a + b, 0) : undefined,
  };

  session.capabilities = {
    liveWatch: true,
    prompts: true,
    assistantMessages: true,
    shellCommands: true,
    // Claude captures tool results, which for Bash is the command output.
    shellOutput: true,
    fileReads: true,
    fileWrites: true,
    fileEdits: true,
    mcpCalls: true,
    subagents: true,
    tokenUsage: true,
    // Cost is only claimed where the model is actually priceable; otherwise the UI must not offer a cost view.
    cost: pricing.hasPricing(detail.model),
    contextMetrics: true,
    reasoningMetadata: true,
  };

  return session;
}
