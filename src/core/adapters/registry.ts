import { AdapterDetectionContext, AgentAdapter, DetectionResult } from './agentAdapter';
import { AgentProviderId } from '../models/agentEvent';

/**
 * Adapter registry.
 *
 * An explicit registry rather than a module-level array of imports, so tests can register a fake adapter and
 * so a future extension point does not require editing a central list. Registration is by instance because an
 * adapter may need configuration; the registry does not construct anything itself.
 */

export interface AdapterAvailability {
  adapter: AgentAdapter;
  detection: DetectionResult;
}

export class AdapterRegistry {
  private readonly adapters = new Map<AgentProviderId, AgentAdapter>();

  /**
   * Registering the same id twice is a programming error, not a merge. Silently replacing would make load
   * order decide which implementation runs, which is the kind of bug that only appears on someone else machine.
   */
  register(adapter: AgentAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`adapter already registered for provider "${adapter.id}"`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(providerId: AgentProviderId): AgentAdapter | undefined {
    return this.adapters.get(providerId);
  }

  list(): AgentAdapter[] {
    return [...this.adapters.values()];
  }

  /**
   * Detect every registered provider.
   *
   * One adapter failing must not hide the others: a provider whose store is missing, unreadable or corrupt is a
   * normal condition on a machine that does not use it. A throwing adapter is reported as unavailable with the
   * error as its reason, and the rest still run.
   */
  async detectAvailable(context: AdapterDetectionContext = {}): Promise<AdapterAvailability[]> {
    const results = await Promise.all(
      this.list().map(async (adapter): Promise<AdapterAvailability> => {
        try {
          return { adapter, detection: await adapter.detect(context) };
        } catch (err) {
          return {
            adapter,
            detection: {
              available: false,
              roots: [],
              reason: `detection failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          };
        }
      })
    );
    return results;
  }

  /** Test seam. Production code registers once at activation and never clears. */
  clear(): void {
    this.adapters.clear();
  }
}

/** Shared registry for the extension host. Tests construct their own rather than mutating this one. */
export const registry = new AdapterRegistry();
