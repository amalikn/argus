import { describe, expect, it } from 'vitest';
import { AdapterRegistry } from '../src/core/adapters/registry';
import { AgentAdapter, DiscoveredSession } from '../src/core/adapters/agentAdapter';
import { AgentSession, NO_CAPABILITIES } from '../src/core/models/agentSession';
import { ProviderSessionService } from '../src/services/providerSessionService';

/**
 * These assert the isolation rules rather than the happy path. The service exists to add two providers WITHOUT touching the one
 * that already works, so the properties worth testing are the ones that would let it reach across that line.
 */

function discovered(id: string, providerId: string, clientName: string): DiscoveredSession {
  return {
    id,
    providerId,
    source: { providerId, clientName, sourceKind: 'jsonl' },
    projectPath: '/work',
    title: `title-${id}`,
    updatedAt: new Date().toISOString(),
  };
}

function fakeAdapter(
  id: string,
  clientName: string,
  sessions: DiscoveredSession[],
  overrides: Partial<AgentAdapter> = {}
): AgentAdapter {
  return {
    id,
    displayName: clientName,
    detect: async () => ({ available: true, roots: ['/root'] }),
    discover: async () => sessions,
    parse: async (session): Promise<AgentSession> => ({
      schemaVersion: 1,
      id: session.id,
      providerId: id,
      source: session.source,
      events: [
        { id: 'e0', sessionId: session.id, providerId: id, sequence: 0, kind: 'message.user', text: 'hello' },
      ],
      capabilities: { ...NO_CAPABILITIES },
      diagnostics: [],
    }),
    getCapabilities: () => ({ ...NO_CAPABILITIES }),
    ...overrides,
  } as AgentAdapter;
}

async function serviceWith(adapters: AgentAdapter[]): Promise<ProviderSessionService> {
  const registry = new AdapterRegistry();
  for (const adapter of adapters) {
    registry.register(adapter);
  }
  const service = new ProviderSessionService(registry);
  await service.refresh();
  return service;
}

describe('ProviderSessionService', () => {
  it('never claims a Claude session', async () => {
    // The whole design rests on this: a session this service owns skips the legacy path entirely. If it ever claimed a Claude
    // session, Claude would silently start rendering through an unproven projection and the parity snapshots would not notice,
    // because they test the parser rather than the route taken to reach it.
    const service = await serviceWith([fakeAdapter('claude-code', 'Claude Code', [discovered('c1', 'claude-code', 'Claude Code')])]);
    expect(service.owns('c1')).toBe(false);
    expect(service.summaries()).toHaveLength(0);
    expect(await service.load('c1')).toBeNull();
  });

  it('owns sessions from every other provider', async () => {
    const service = await serviceWith([
      fakeAdapter('openai-codex', 'OpenAI Codex', [discovered('x1', 'openai-codex', 'OpenAI Codex')]),
      fakeAdapter('hermes', 'Hermes', [discovered('h1', 'hermes', 'Hermes')]),
    ]);
    expect(service.owns('x1')).toBe(true);
    expect(service.owns('h1')).toBe(true);
    expect(service.summaries().map((s) => s.sessionId).sort()).toEqual(['h1', 'x1']);
  });

  it('returns null for an id it does not own so the caller falls through', async () => {
    // Null must mean "not mine", never "broken". The webview provider distinguishes the two by falling through rather than erroring.
    const service = await serviceWith([fakeAdapter('openai-codex', 'OpenAI Codex', [])]);
    expect(await service.load('never-seen')).toBeNull();
  });

  it('keeps one failing adapter from emptying the list', async () => {
    // A provider whose store is missing or unreadable is the normal condition on a machine that does not use it.
    const broken = fakeAdapter('hermes', 'Hermes', [], {
      discover: async () => {
        throw new Error('store unreadable');
      },
    });
    const working = fakeAdapter('openai-codex', 'OpenAI Codex', [discovered('x1', 'openai-codex', 'OpenAI Codex')]);
    const service = await serviceWith([broken, working]);
    expect(service.summaries().map((s) => s.sessionId)).toEqual(['x1']);
  });

  it('skips a provider that is not available on this machine', async () => {
    const absent = fakeAdapter('hermes', 'Hermes', [discovered('h1', 'hermes', 'Hermes')], {
      detect: async () => ({ available: false, roots: [], reason: 'not installed' }),
    });
    const service = await serviceWith([absent]);
    expect(service.summaries()).toHaveLength(0);
  });

  it('takes the provider label from the adapter, never from the id', async () => {
    const service = await serviceWith([
      fakeAdapter('openai-codex', 'OpenAI Codex', [discovered('x1', 'openai-codex', 'OpenAI Codex')]),
    ]);
    expect(service.summaries()[0].providerName).toBe('OpenAI Codex');
  });

  it('leaves model empty rather than guessing, because discovery does not parse', async () => {
    const service = await serviceWith([
      fakeAdapter('openai-codex', 'OpenAI Codex', [discovered('x1', 'openai-codex', 'OpenAI Codex')]),
    ]);
    expect(service.summaries()[0].model).toBe('');
  });

  it('loads an owned session through the projection', async () => {
    const service = await serviceWith([
      fakeAdapter('openai-codex', 'OpenAI Codex', [discovered('x1', 'openai-codex', 'OpenAI Codex')]),
    ]);
    const detail = await service.load('x1');
    expect(detail?.providerId).toBe('openai-codex');
    expect(detail?.steps.map((s) => s.content)).toEqual(['hello']);
  });

  it('drops stale sessions on refresh rather than accumulating them', async () => {
    // A session deleted from the store must leave the list. Accumulating would show sessions that no longer exist.
    const registry = new AdapterRegistry();
    let sessions = [discovered('x1', 'openai-codex', 'OpenAI Codex')];
    registry.register(fakeAdapter('openai-codex', 'OpenAI Codex', [], { discover: async () => sessions }));
    const service = new ProviderSessionService(registry);

    await service.refresh();
    expect(service.owns('x1')).toBe(true);

    sessions = [];
    await service.refresh();
    expect(service.owns('x1')).toBe(false);
  });
});
