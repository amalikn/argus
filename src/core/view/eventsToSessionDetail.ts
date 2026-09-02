/**
 * Projects a normalized AgentSession onto the legacy SessionDetail the webview consumes.
 *
 * Why this exists rather than a new renderer: the webview is twelve tabs and ~4,600 lines built around SessionDetail. Every one of
 * them works for Claude today. A projection makes all twelve work for Codex and Hermes in one step, where an event-native rewrite
 * would make one tab work for three providers and leave six tabs Claude-only until each is ported.
 *
 * What this is NOT: the destination. The projection is lossy by construction — seventeen event kinds collapse into five StepTypes,
 * and two things survive nowhere in SessionDetail at all: the per-event `confidence` field, and `provider.unknown` events. Those are
 * the subject of the event-native tab that follows this. Read this file as a bridge with a known load limit, not as the model.
 *
 * The lossiness is deliberate and one-directional. Do not "fix" it by widening SessionDetail: that type is the Claude-shaped legacy
 * surface, and widening it would push provider concepts into every tab that reads it — exactly the branching the adapter contract
 * exists to prevent.
 */

import { pricing } from '../pricing/pricingProvider';
import { AgentEvent } from '../models/agentEvent';
import { AgentSession } from '../models/agentSession';
import { SessionDetail, Step, StepType, Usage } from '../../types/models';

/** Tool-call-shaped events carry a display name that the UI groups and counts on. One place, so the names cannot drift per adapter. */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  'shell.command': 'Bash',
  'file.read': 'Read',
  'file.write': 'Write',
  'file.edit': 'Edit',
  'network.tool': 'WebFetch',
};

/** Maps an event kind onto the coarse StepType the webview switches on. Kinds absent here do not become steps at all. */
const STEP_TYPE_BY_KIND: Partial<Record<AgentEvent['kind'], StepType>> = {
  'message.user': 'text',
  'message.assistant': 'text',
  reasoning: 'thinking',
  'tool.call': 'tool_call',
  'shell.command': 'tool_call',
  'file.read': 'tool_call',
  'file.write': 'tool_call',
  'file.edit': 'tool_call',
  'mcp.call': 'tool_call',
  'network.tool': 'tool_call',
  'subagent.start': 'subagent',
  error: 'error',
};

function usageFrom(event: Extract<AgentEvent, { kind: 'usage.tokens' }>): Usage {
  // Zero is a real reported value here and undefined is a different claim, but the legacy Usage type has no undefined. Coercing to
  // zero is therefore a genuine narrowing, and it is the reason `cost` below is left undefined rather than computed from zeroes.
  return {
    input_tokens: event.inputTokens ?? 0,
    output_tokens: event.outputTokens ?? 0,
    cache_read_input_tokens: event.cachedInputTokens ?? 0,
    cache_creation_input_tokens: event.cacheWriteTokens ?? 0,
  };
}

/**
 * Cost for one usage event.
 *
 * The adapter's own `estimatedCostUsd` wins when present, because the adapter may know a rate this table does not. Otherwise the
 * shared pricing table answers, and an unknown model yields `undefined` — never another model's rates, and never zero. Finding F5.
 */
function costFrom(event: Extract<AgentEvent, { kind: 'usage.tokens' }>, sessionModel?: string): number | undefined {
  if (typeof event.estimatedCostUsd === 'number') {
    return event.estimatedCostUsd;
  }
  return pricing.calculateCost(usageFrom(event), event.model ?? sessionModel);
}

/**
 * Projects a `provider.unknown` event onto a neutral, visible step.
 *
 * `provider.unknown` means the source contained a record, the adapter preserved it, and the normalizer does not understand its
 * semantics. That is a distinct claim from all three things the projection could have turned it into:
 *
 *   absent     Dropping it produces the failure this event kind exists to prevent: a provider adds a record type, the adapter
 *              notices it, the projection discards it, and the UI looks complete while under-reporting the session.
 *   success    Nothing here reports an outcome, so any outcome is invented evidence.
 *   error      "I do not understand this record" is not "the provider failed". Colouring it red asserts a failure that did not
 *              happen, and teaches users to ignore red.
 *
 * So: preserve existence, invent no meaning. The step is plain `text` carrying the provider's own `rawType`, which is the one fact
 * the adapter is certain of.
 *
 * The raw payload deliberately does NOT go into the timeline. It is unbounded, unvalidated provider data, and the timeline is read
 * linearly - a single large unknown record would bury the session around it. The payload stays on the event, where the event-native
 * tab can show it on demand.
 *
 * Known limit, and the reason this is a compatibility projection rather than the destination: `SessionDetail.Step` has no neutral
 * metadata slot, so `providerId` and `confidence` have nowhere to live and the step cannot be given a diagnostic presentation
 * distinct from ordinary assistant text. Both are carried by the event and belong to the event-native tab.
 */
function projectUnknownEvent(event: Extract<AgentEvent, { kind: 'provider.unknown' }>, index: number): Step | null {
  return {
    index,
    type: 'text',
    timestamp: event.timestamp ? new Date(event.timestamp) : new Date(0),
    uuid: event.id,
    messageId: event.correlationId ?? event.id,
    content: `Unknown provider event\nrawType: ${event.rawType ?? 'unreported'}`,
    // Left undefined rather than zero: an unrecognized record reports no usage, and zero would claim it was free to produce.
    cost: undefined,
  };
}

/**
 * Projects a normalized session onto SessionDetail.
 *
 * Ordering comes from `sequence`, never from `timestamp`: a source with no timestamps must still render in the order it was written,
 * and Hermes is such a source.
 */
export function eventsToSessionDetail(session: AgentSession): SessionDetail {
  const steps: Step[] = [];
  const filesRead = new Set<string>();
  const filesWritten = new Set<string>();
  const toolsUsed = new Map<string, number>();

  // tool.result arrives as its own event and must land on the call it belongs to. Sources that correlate do so by `correlationId`;
  // where a source does not correlate, the result attaches to the most recent open call, which is what a linear transcript implies.
  const openCallByCorrelation = new Map<string, Step>();
  let lastOpenCall: Step | undefined;

  let totalCost: number | undefined;
  const ordered = [...session.events].sort((a, b) => a.sequence - b.sequence);

  for (const event of ordered) {
    if (event.kind === 'usage.tokens') {
      // Usage is reported alongside the assistant turn it describes, so it belongs on the step already emitted rather than on a step
      // of its own. A usage event with no preceding step is dropped: there is nothing for it to describe.
      const cost = costFrom(event, session.model);
      const target = steps[steps.length - 1];
      if (target) {
        target.usage = usageFrom(event);
        target.cost = cost;
      }
      if (cost !== undefined) {
        totalCost = (totalCost ?? 0) + cost;
      }
      continue;
    }

    if (event.kind === 'tool.result') {
      const call = (event.correlationId && openCallByCorrelation.get(event.correlationId)) || lastOpenCall;
      if (call) {
        call.toolResult = typeof event.result === 'string' ? event.result : stringifyResult(event.result);
        // isError absent means the source did not say, which is a different claim from "it succeeded". Leaving toolSuccess
        // undefined keeps that distinction; coercing it to true would invent a success the evidence never reported.
        call.toolSuccess = event.isError === undefined ? undefined : !event.isError;
        if (event.correlationId) {
          openCallByCorrelation.delete(event.correlationId);
        }
        lastOpenCall = undefined;
      }
      continue;
    }

    if (event.kind === 'provider.unknown') {
      const step = projectUnknownEvent(event, steps.length);
      if (step) {
        steps.push(step);
      }
      continue;
    }

    const type = STEP_TYPE_BY_KIND[event.kind];
    if (!type) {
      // context.window, context.compaction, session.lifecycle and subagent.end describe the session rather than a step in it. They
      // are not dropped from the model — they are simply not steps, and the tabs that need them read the session metrics instead.
      continue;
    }

    const step: Step = {
      index: steps.length,
      type,
      timestamp: event.timestamp ? new Date(event.timestamp) : new Date(0),
      uuid: event.id,
      messageId: event.correlationId ?? event.id,
      content: contentOf(event),
      cost: undefined,
    };

    const toolName = toolNameOf(event);
    if (toolName) {
      step.toolName = toolName;
      step.toolInput = toolInputOf(event);
      toolsUsed.set(toolName, (toolsUsed.get(toolName) ?? 0) + 1);
      if (event.correlationId) {
        openCallByCorrelation.set(event.correlationId, step);
      }
      lastOpenCall = step;
    }

    if (event.kind === 'file.read') {
      filesRead.add(event.path);
    } else if (event.kind === 'file.write' || event.kind === 'file.edit') {
      filesWritten.add(event.path);
    }

    steps.push(step);
  }

  const first = ordered.find((e) => e.timestamp)?.timestamp;
  const last = [...ordered].reverse().find((e) => e.timestamp)?.timestamp;
  const startTime = new Date(session.startedAt ?? first ?? 0);
  const endTime = new Date(session.endedAt ?? session.updatedAt ?? last ?? startTime);

  return {
    sessionId: session.id,
    providerId: session.providerId,
    providerName: session.source.clientName,
    capabilities: session.capabilities,
    prompt: session.title ?? firstUserText(ordered) ?? '',
    project: session.projectPath ?? session.cwd ?? '',
    model: session.model ?? '',
    startTime,
    endTime,
    durationMs: Math.max(0, endTime.getTime() - startTime.getTime()),
    // undefined would be the honest value for a session nothing could be costed in, but SessionDetail types this as a number and
    // every tab reading it assumes so. Zero here means "nothing costable", which the cost capability flag already tells the UI.
    totalCost: totalCost ?? 0,
    steps,
    // Subagents are sibling sessions in every provider audited so far, not inline records, so the projection of a single session
    // never has any. The Map tab reads an empty list rather than a wrong one.
    subagents: [],
    filesRead: [...filesRead],
    filesWritten: [...filesWritten],
    toolsUsed: Object.fromEntries(toolsUsed),
  };
}

/** Tool results are `unknown` in the model because a source may return any shape. The UI needs a string, so serialize once, here. */
function stringifyResult(result: unknown): string | undefined {
  if (result === undefined || result === null) {
    return undefined;
  }
  try {
    return JSON.stringify(result);
  } catch {
    // A result carrying a cycle or a BigInt is still evidence. Reporting its type beats dropping the record silently.
    return `[unserializable ${typeof result}]`;
  }
}

function firstUserText(events: AgentEvent[]): string | undefined {
  for (const event of events) {
    if (event.kind === 'message.user' && event.text.trim()) {
      return event.text;
    }
  }
  return undefined;
}

function contentOf(event: AgentEvent): string {
  switch (event.kind) {
    case 'message.user':
    case 'message.assistant':
    case 'reasoning':
      return event.text;
    case 'error':
      return event.message;
    case 'shell.command':
      return event.command;
    case 'file.read':
    case 'file.write':
    case 'file.edit':
      return event.path;
    case 'mcp.call':
      return `${event.server}/${event.tool}`;
    case 'network.tool':
      return event.url ?? event.toolName;
    case 'subagent.start':
      return event.description ?? event.subagentId;
    default:
      return '';
  }
}

function toolNameOf(event: AgentEvent): string | undefined {
  if (event.kind === 'tool.call') {
    return event.toolName;
  }
  if (event.kind === 'mcp.call') {
    return `mcp__${event.server}__${event.tool}`;
  }
  return TOOL_DISPLAY_NAMES[event.kind];
}

function toolInputOf(event: AgentEvent): unknown {
  switch (event.kind) {
    case 'tool.call':
      return event.arguments;
    case 'shell.command':
      return { command: event.command };
    case 'file.read':
    case 'file.write':
    case 'file.edit':
      return { path: event.path };
    case 'mcp.call':
      return event.arguments;
    case 'network.tool':
      return { url: event.url };
    default:
      return undefined;
  }
}
