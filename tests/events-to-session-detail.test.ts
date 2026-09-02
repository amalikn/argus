import { describe, expect, it } from 'vitest';
import { eventsToSessionDetail } from '../src/core/view/eventsToSessionDetail';
import { AgentEvent } from '../src/core/models/agentEvent';
import { AgentSession, NO_CAPABILITIES } from '../src/core/models/agentSession';

/**
 * The projection is a bridge between the normalized model and the Claude-shaped type the webview still consumes, and every rule it
 * applies is the kind that decays without noticing: a distinction that exists only in a comment survives exactly until someone
 * "simplifies" it. These tests assert the distinctions themselves, not the shape of the output.
 */

let sequence = 0;

function event(partial: Partial<AgentEvent> & Pick<AgentEvent, 'kind'>): AgentEvent {
  return {
    id: `e${sequence}`,
    sessionId: 's1',
    providerId: 'openai-codex',
    sequence: sequence++,
    ...partial,
  } as AgentEvent;
}

function session(events: AgentEvent[], overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    schemaVersion: 1,
    id: 's1',
    providerId: 'openai-codex',
    source: { providerId: 'openai-codex', clientName: 'OpenAI Codex', sourceKind: 'jsonl' },
    events,
    capabilities: { ...NO_CAPABILITIES },
    diagnostics: [],
    ...overrides,
  };
}

describe('eventsToSessionDetail', () => {
  it('orders by sequence, not by timestamp', () => {
    // A source with no timestamps must still render in written order. Hermes is such a source, so this is not hypothetical.
    sequence = 0;
    const later = event({ kind: 'message.user', text: 'first written', timestamp: '2030-01-01T00:00:00Z' } as never);
    const earlier = event({ kind: 'message.assistant', text: 'second written', timestamp: '2000-01-01T00:00:00Z' } as never);
    const detail = eventsToSessionDetail(session([later, earlier]));
    expect(detail.steps.map((s) => s.content)).toEqual(['first written', 'second written']);
  });

  it('keeps an unknown event as a visible neutral step carrying its rawType', () => {
    // The rule: unknown is not absent and not an error. A silent drop makes the UI look complete while under-reporting a session
    // whose source has moved on, which is the whole reason provider.unknown exists.
    sequence = 0;
    const detail = eventsToSessionDetail(
      session([event({ kind: 'provider.unknown', rawType: 'response.foo_v2', payload: { big: 'x' } } as never)])
    );
    expect(detail.steps).toHaveLength(1);
    expect(detail.steps[0].type).toBe('text');
    expect(detail.steps[0].content).toContain('response.foo_v2');
    expect(detail.steps[0].type).not.toBe('error');
  });

  it('never puts an unknown event payload into the timeline', () => {
    // Unbounded provider data would bury the session around it. The payload stays on the event for the event-native tab.
    sequence = 0;
    const secret = 'PAYLOAD_MUST_NOT_APPEAR_IN_TIMELINE';
    const detail = eventsToSessionDetail(
      session([event({ kind: 'provider.unknown', rawType: 't', payload: { note: secret } } as never)])
    );
    expect(detail.steps[0].content).not.toContain(secret);
  });

  it('leaves toolSuccess undefined when the source did not report an outcome', () => {
    // isError absent is "the source did not say", which is a different claim from "it succeeded". Coercing to true invents evidence.
    sequence = 0;
    const call = event({ kind: 'tool.call', toolName: 'Grep', correlationId: 'c1' } as never);
    const result = event({ kind: 'tool.result', correlationId: 'c1', result: 'out' } as never);
    const detail = eventsToSessionDetail(session([call, result]));
    expect(detail.steps[0].toolResult).toBe('out');
    expect(detail.steps[0].toolSuccess).toBeUndefined();
  });

  it('reports toolSuccess false only when the source said the call failed', () => {
    sequence = 0;
    const call = event({ kind: 'tool.call', toolName: 'Grep', correlationId: 'c1' } as never);
    const result = event({ kind: 'tool.result', correlationId: 'c1', result: 'boom', isError: true } as never);
    const detail = eventsToSessionDetail(session([call, result]));
    expect(detail.steps[0].toolSuccess).toBe(false);
  });

  it('leaves cost undefined for a model absent from the pricing table', () => {
    // Finding F5: an unknown model must never be costed at another model rates, and zero is a different claim from unknown.
    sequence = 0;
    const assistant = event({ kind: 'message.assistant', text: 'hi' } as never);
    const usage = event({ kind: 'usage.tokens', inputTokens: 100, outputTokens: 50, model: 'not-a-real-model-xyz' } as never);
    const detail = eventsToSessionDetail(session([assistant, usage]));
    expect(detail.steps[0].usage).toEqual({
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
    expect(detail.steps[0].cost).toBeUndefined();
  });

  it('does not turn session-level events into steps', () => {
    // context.window, context.compaction, session.lifecycle and subagent.end describe the session, not a step in it.
    sequence = 0;
    const detail = eventsToSessionDetail(
      session([
        event({ kind: 'session.lifecycle', phase: 'start' } as never),
        event({ kind: 'context.window', usedTokens: 10, windowTokens: 100 } as never),
        event({ kind: 'context.compaction', reason: 'full' } as never),
        event({ kind: 'subagent.end', subagentId: 'a1' } as never),
      ])
    );
    expect(detail.steps).toHaveLength(0);
  });

  it('collects files read and written from the typed file events', () => {
    sequence = 0;
    const detail = eventsToSessionDetail(
      session([
        event({ kind: 'file.read', path: '/a.ts' } as never),
        event({ kind: 'file.write', path: '/b.ts' } as never),
        event({ kind: 'file.edit', path: '/c.ts' } as never),
      ])
    );
    expect(detail.filesRead).toEqual(['/a.ts']);
    expect(detail.filesWritten).toEqual(['/b.ts', '/c.ts']);
    expect(detail.toolsUsed).toEqual({ Read: 1, Write: 1, Edit: 1 });
  });

  it('carries provider identity through from the source descriptor', () => {
    // The UI labels on this and never maps ids to names itself, so the name must come from the adapter.
    sequence = 0;
    const detail = eventsToSessionDetail(session([event({ kind: 'message.user', text: 'q' } as never)]));
    expect(detail.providerId).toBe('openai-codex');
    expect(detail.providerName).toBe('OpenAI Codex');
  });
});
