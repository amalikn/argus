import { describe, expect, it, vi } from 'vitest';
import { NORMALIZED_SCHEMA_VERSION, SessionMigration, migrateSession } from '../src/core/models/schema';
import { AgentEvent, isKind } from '../src/core/models/agentEvent';
import { NO_CAPABILITIES, emptySession } from '../src/core/models/agentSession';
import { AdapterRegistry } from '../src/core/adapters/registry';
import { AgentAdapter } from '../src/core/adapters/agentAdapter';

function fakeAdapter(id: string, overrides: Partial<AgentAdapter> = {}): AgentAdapter {
  return {
    id,
    displayName: id,
    detect: async () => ({ available: true, roots: [`/tmp/${id}`] }),
    discover: async () => [],
    parse: async () => emptySession('s', id, { providerId: id, clientName: id, sourceKind: 'jsonl' }),
    getCapabilities: () => NO_CAPABILITIES,
    ...overrides,
  };
}

describe('normalized session model', () => {
  it('stamps the schema version so a stored session is never ambiguous', () => {
    const s = emptySession('s1', 'claude-code', { providerId: 'claude-code', clientName: 'Claude Code', sourceKind: 'jsonl' });
    expect(s.schemaVersion).toBe(NORMALIZED_SCHEMA_VERSION);
  });

  it('starts every capability off, so an adapter must prove what it supports', () => {
    const s = emptySession('s1', 'x', { providerId: 'x', clientName: 'x', sourceKind: 'custom' });
    expect(Object.values(s.capabilities).every((v) => v === false)).toBe(true);
  });

  it('always carries a diagnostics array, because absent and clean are different claims', () => {
    const s = emptySession('s1', 'x', { providerId: 'x', clientName: 'x', sourceKind: 'custom' });
    expect(Array.isArray(s.diagnostics)).toBe(true);
  });

  it('narrows events by kind', () => {
    const event: AgentEvent = {
      kind: 'shell.command', id: 'e1', sessionId: 's1', providerId: 'claude-code', sequence: 0, command: 'ls',
    };
    expect(isKind(event, 'shell.command')).toBe(true);
    if (isKind(event, 'shell.command')) {
      expect(event.command).toBe('ls');
    }
    expect(isKind(event, 'mcp.call')).toBe(false);
  });
});

describe('schema migration', () => {
  const one: SessionMigration = { fromVersion: 0, toVersion: 1, migrate: (i: any) => ({ ...i, migrated: true }) };

  it('is a no-op at the current version', () => {
    const input = { a: 1 };
    expect(migrateSession(input, NORMALIZED_SCHEMA_VERSION, [])).toBe(input);
  });

  it('applies a registered step', () => {
    expect(migrateSession({ a: 1 }, 0, [one])).toEqual({ a: 1, migrated: true });
  });

  it('refuses a version it has no path from, rather than passing it through', () => {
    expect(() => migrateSession({}, 0, [])).toThrow(/no migration registered/);
  });

  // Silently accepting a newer session would let fields this build has never seen flow into code that assumes
  // they cannot exist. Failing loudly is the only safe response to evidence written by a future version.
  it('refuses a session from a newer schema version', () => {
    expect(() => migrateSession({}, NORMALIZED_SCHEMA_VERSION + 1, [])).toThrow(/newer than this build/);
  });
});

describe('adapter registry', () => {
  it('registers and resolves by provider id', () => {
    const r = new AdapterRegistry();
    r.register(fakeAdapter('claude-code'));
    expect(r.get('claude-code')?.displayName).toBe('claude-code');
    expect(r.get('nope')).toBeUndefined();
    expect(r.list()).toHaveLength(1);
  });

  it('refuses a duplicate registration rather than letting load order decide', () => {
    const r = new AdapterRegistry();
    r.register(fakeAdapter('claude-code'));
    expect(() => r.register(fakeAdapter('claude-code'))).toThrow(/already registered/);
  });

  it('detects every adapter', async () => {
    const r = new AdapterRegistry();
    r.register(fakeAdapter('a'));
    r.register(fakeAdapter('b'));
    const found = await r.detectAvailable();
    expect(found.map((f) => f.adapter.id).sort()).toEqual(['a', 'b']);
    expect(found.every((f) => f.detection.available)).toBe(true);
  });

  // A provider whose store is missing or corrupt is a normal condition on a machine that does not use it.
  // One adapter throwing must not hide the others, or a single broken provider blanks the whole session list.
  it('isolates a throwing adapter instead of failing the whole detection pass', async () => {
    const r = new AdapterRegistry();
    r.register(fakeAdapter('good'));
    r.register(fakeAdapter('bad', { detect: vi.fn().mockRejectedValue(new Error('permission denied')) }));
    const found = await r.detectAvailable();

    const good = found.find((f) => f.adapter.id === 'good')!;
    const bad = found.find((f) => f.adapter.id === 'bad')!;
    expect(good.detection.available).toBe(true);
    expect(bad.detection.available).toBe(false);
    expect(bad.detection.reason).toContain('permission denied');
  });
});

describe('AgentProviderId stays open', () => {
  it('accepts a provider id the core has never heard of', () => {
    // The open union is what makes "add an adapter, not a core-type edit" true. If this stops compiling, the
    // union was closed and every future provider becomes a change to shared types.
    const future: import('../src/core/models/agentEvent').AgentProviderId = 'some-agent-invented-later';
    expect(future).toBe('some-agent-invented-later');
  });
});
