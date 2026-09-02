/**
 * Lists and loads sessions from every provider EXCEPT Claude Code.
 *
 * Claude keeps its existing path — DiscoveryService, ParserService, the sixteen parity snapshots — entirely untouched. That path is
 * the known-good one, and the snapshots are the only thing protecting it; routing Claude through a projection that has never
 * rendered anything would put the working provider at risk to make two non-working providers work. Convergence is a later decision
 * with its own gates, taken once the generic path has proven itself richer-or-equal, not merely prettier.
 *
 * So this service is deliberately a second path rather than a replacement. It exists to answer two questions for the providers the
 * legacy path cannot see:
 *
 *   what sessions exist    `summaries()`, merged into the list alongside Claude's
 *   what is in one         `load()`, which parses through the adapter and projects onto SessionDetail
 *
 * The blast radius is two call sites: the list built in extension.ts, and the miss path in SessionWebviewProviderReact. Nothing
 * else changes, and with no non-Claude provider installed this class discovers nothing and the extension behaves exactly as before.
 */

import { AdapterRegistry } from '../core/adapters/registry';
import { DiscoveredSession } from '../core/adapters/agentAdapter';
import { eventsToSessionDetail } from '../core/view/eventsToSessionDetail';
import { SessionDetail, SessionSummary } from '../types/models';

/** The provider that keeps its legacy path. Named once so the exclusion is a stated rule rather than a scattered condition. */
const LEGACY_PROVIDER_ID = 'claude-code';

/** A session whose file changed within this window is shown as live. Same rule the Claude list applies, so the badge means one thing. */
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;

export class ProviderSessionService {
  private readonly discovered = new Map<string, DiscoveredSession>();

  constructor(private readonly registry: AdapterRegistry) {}

  /**
   * Re-discover every non-legacy provider.
   *
   * One adapter failing must not empty the list: a provider whose store is missing or unreadable is the normal condition on a
   * machine that does not use it. Each adapter is isolated, and a thrown error costs that provider's sessions and nothing else.
   */
  async refresh(): Promise<void> {
    this.discovered.clear();
    const availability = await this.registry.detectAvailable();

    await Promise.all(
      availability.map(async ({ adapter, detection }) => {
        if (adapter.id === LEGACY_PROVIDER_ID || !detection.available) {
          return;
        }
        try {
          for (const session of await adapter.discover({ roots: detection.roots })) {
            this.discovered.set(session.id, session);
          }
        } catch (err) {
          console.error(`[argus] discovery failed for provider "${adapter.id}":`, err);
        }
      })
    );
  }

  /** Whether this service owns the session, and therefore whether the legacy path should be skipped for it. */
  owns(sessionId: string): boolean {
    return this.discovered.has(sessionId);
  }

  /**
   * Summaries for the session list.
   *
   * `model` is empty where discovery does not report one, and discovery is required to stay cheap — no adapter parses a session to
   * answer "what exists". An empty model is honest here: the UI shows nothing rather than a guess, and the real model appears once
   * the session is opened.
   */
  summaries(): SessionSummary[] {
    const now = Date.now();
    const out: SessionSummary[] = [];

    for (const session of this.discovered.values()) {
      const updated = session.updatedAt ? new Date(session.updatedAt) : new Date(0);
      out.push({
        sessionId: session.id,
        providerId: session.providerId,
        // The adapter names its own provider. The UI never maps an id to a label itself.
        providerName: session.source.clientName,
        prompt: session.title ?? '',
        project: session.projectPath ?? '',
        model: '',
        timestamp: updated,
        lastModified: updated,
        isActive: now - updated.getTime() < ACTIVE_WINDOW_MS,
      });
    }

    return out;
  }

  /**
   * Parses one session through its adapter and projects it onto SessionDetail.
   *
   * Returns null when the session is not ours or its adapter is gone, so the caller can fall through to the legacy path rather
   * than treating an unknown id as an error.
   */
  async load(sessionId: string): Promise<SessionDetail | null> {
    const session = this.discovered.get(sessionId);
    if (!session) {
      return null;
    }

    const adapter = this.registry.get(session.providerId);
    if (!adapter) {
      console.error(`[argus] no adapter registered for provider "${session.providerId}"`);
      return null;
    }

    const parsed = await adapter.parse(session);
    const detail = eventsToSessionDetail(parsed);

    // Diagnostics are surfaced rather than swallowed, and a parse that reported problems is worth seeing in the host log even when
    // the session renders. An empty array and an absent one are different claims, which is why the model always carries one.
    if (parsed.diagnostics.length) {
      console.warn(`[argus] ${sessionId} parsed with ${parsed.diagnostics.length} diagnostic(s)`, parsed.diagnostics);
    }

    return detail;
  }
}
