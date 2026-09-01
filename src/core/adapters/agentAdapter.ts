import { AgentSession, AgentSessionCapabilities, AgentSessionDelta, AgentSourceDescriptor } from '../models/agentSession';
import { AgentProviderId } from '../models/agentEvent';

/**
 * The adapter contract.
 *
 * This is the ONLY place provider knowledge is allowed to live. Everything downstream — analyzer, timeline,
 * cost views, dependency graph, search, live watcher, export — consumes the normalized model and never a raw
 * provider record. See .archcore/specs/normalized-layering.spec.md.
 *
 * Adding a fourth agent means implementing this interface. If it ever means editing a consumer, the boundary
 * has been broken and that is the defect, not the inconvenience.
 */

export interface AdapterDetectionContext {
  /** Explicit roots from settings. When non-empty, an adapter should prefer these over its own defaults. */
  configuredPaths?: string[];
  /** Environment, injected rather than read, so detection is testable without mutating process.env. */
  env?: Record<string, string | undefined>;
  homeDir?: string;
}

export interface DetectionResult {
  available: boolean;
  /** Roots the adapter will actually scan. Empty with `available: true` is a contradiction worth surfacing. */
  roots: string[];
  /** Why detection failed or partially succeeded. Shown to the user rather than logged and forgotten. */
  reason?: string;
  clientVersion?: string;
}

export interface SessionDiscoveryContext extends AdapterDetectionContext {
  roots: string[];
  /** Discover only sessions modified after this instant, for incremental refresh. */
  since?: Date;
  includeArchived?: boolean;
}

/** A session located but not yet parsed. Discovery must stay cheap: no adapter parses to answer "what exists". */
export interface DiscoveredSession {
  id: string;
  providerId: AgentProviderId;
  source: AgentSourceDescriptor;
  projectPath?: string;
  title?: string;
  updatedAt?: string;
  sizeBytes?: number;
  /** Present when the discovered session is a subagent of another. */
  parentSessionId?: string;
}

export interface ParseContext {
  /** Stop after this many bytes, for a session too large to hold. The adapter reports the truncation. */
  maxBytes?: number;
  signal?: AbortSignal;
}

export interface WatchContext {
  signal?: AbortSignal;
  /** Coalesce bursts of writes. A live transcript is appended to far faster than a UI can usefully redraw. */
  debounceMs?: number;
}

export interface Disposable {
  dispose(): void;
}

export type AgentAdapterCapabilities = AgentSessionCapabilities;

export interface AgentAdapter {
  readonly id: AgentProviderId;
  readonly displayName: string;

  /** Is this provider present on this machine, and where. Must never throw on a missing provider. */
  detect(context: AdapterDetectionContext): Promise<DetectionResult>;

  /** Enumerate sessions without parsing them. */
  discover(context: SessionDiscoveryContext): Promise<DiscoveredSession[]>;

  /** Parse one discovered session into the normalized model. */
  parse(discovered: DiscoveredSession, context?: ParseContext): Promise<AgentSession>;

  /** Optional: follow a live session. Absent means the provider cannot be watched, not that it was forgotten. */
  watch?(
    discovered: DiscoveredSession,
    onDelta: (delta: AgentSessionDelta) => void,
    context?: WatchContext
  ): Promise<Disposable>;

  /** What this adapter can prove about its provider. Drives the UI; never inferred from the provider id. */
  getCapabilities(): AgentAdapterCapabilities;
}
