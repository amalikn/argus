import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AdapterDetectionContext,
  AgentAdapter,
  AgentAdapterCapabilities,
  DetectionResult,
  DiscoveredSession,
  Disposable,
  ParseContext,
  SessionDiscoveryContext,
  WatchContext,
} from '../../core/adapters/agentAdapter';
import { AgentSession, AgentSessionDelta, AgentSourceDescriptor } from '../../core/models/agentSession';
import { SessionFileWatcher } from '../../core/watch/sessionFileWatcher';
import { parseMirror, parseSnapshot } from './parser';

/**
 * Hermes adapter.
 *
 * Reads `~/.hermes/sessions/`, which holds two formats written by two different writers:
 *   session_*.json  - the snapshot. Primary. Carries session_id, session_start, last_updated, message_count.
 *   *.jsonl         - the mirror. Secondary. Same sessions, fewer of them, no embedded id.
 *
 * See docs/adapters/hermes-source-audit.md and .archcore/adr/hermes-snapshot-is-primary.adr.md.
 */
export class HermesAdapter implements AgentAdapter {
  readonly id = 'hermes';
  readonly displayName = 'Hermes';

  private hermesHome(context: AdapterDetectionContext): string {
    // HERMES_HOME is what the agent itself reads. The installed source also warns, into errors.log, when
    // HERMES_HOME is unset while a non-default profile is active, precisely because that combination corrupts
    // data silently. We honour the variable and never guess a profile.
    const fromEnv = context.env?.HERMES_HOME ?? process.env.HERMES_HOME;
    if (fromEnv && fromEnv.trim()) {
      return fromEnv;
    }
    return path.join(context.homeDir ?? os.homedir(), '.hermes');
  }

  async detect(context: AdapterDetectionContext = {}): Promise<DetectionResult> {
    const roots: string[] = [];
    for (const configured of context.configuredPaths ?? []) {
      if (configured && fs.existsSync(path.join(configured, 'sessions'))) {
        roots.push(configured);
      }
    }
    if (roots.length === 0) {
      const home = this.hermesHome(context);
      if (fs.existsSync(path.join(home, 'sessions'))) {
        roots.push(home);
      }
    }
    if (roots.length === 0) {
      return { available: false, roots: [], reason: 'no Hermes sessions directory found' };
    }
    return { available: true, roots };
  }

  /**
   * Enumerate sessions from both forms, preferring the snapshot.
   *
   * The two writers describe the SAME sessions - every mirror stem appeared as a session_id inside the snapshot
   * store - so a mirror is listed only when no snapshot claims its id. Listing both would show every session
   * twice, which is worse than showing the weaker one.
   */
  async discover(context: SessionDiscoveryContext): Promise<DiscoveredSession[]> {
    const bySessionId = new Map<string, DiscoveredSession>();
    const mirrors: DiscoveredSession[] = [];

    for (const root of context.roots) {
      const dir = path.join(root, 'sessions');
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }
        const filePath = path.join(dir, entry.name);
        let stat: fs.Stats;
        try {
          stat = fs.statSync(filePath);
        } catch {
          continue;
        }
        if (context.since && stat.mtime < context.since) {
          continue;
        }

        if (entry.name.startsWith('session_') && entry.name.endsWith('.json')) {
          // The id must come from inside the file. Reading a small header is the price of correctness: in the
          // audited store 76 of 243 filenames disagreed with the embedded session_id.
          const id = this.snapshotSessionId(filePath) ?? entry.name.replace(/^session_|\.json$/g, '');
          bySessionId.set(id, {
            id,
            providerId: this.id,
            source: this.describe(filePath, 'snapshot'),
            updatedAt: stat.mtime.toISOString(),
            sizeBytes: stat.size,
          });
        } else if (entry.name.endsWith('.jsonl')) {
          mirrors.push({
            id: entry.name.replace(/\.jsonl$/, ''),
            providerId: this.id,
            source: this.describe(filePath, 'mirror'),
            updatedAt: stat.mtime.toISOString(),
            sizeBytes: stat.size,
          });
        }
      }
    }

    for (const mirror of mirrors) {
      if (!bySessionId.has(mirror.id)) {
        bySessionId.set(mirror.id, mirror);
      }
    }
    return [...bySessionId.values()];
  }

  /**
   * Read only the session_id out of a snapshot without parsing the whole file.
   *
   * Snapshots reach several MB and discovery must stay cheap, so this reads a bounded prefix. session_id is the
   * first key the writer emits, so a small window is enough; if it is not found the caller falls back to the
   * filename and the parser records a diagnostic.
   */
  private snapshotSessionId(filePath: string): string | undefined {
    let handle: number | undefined;
    try {
      handle = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(512);
      const read = fs.readSync(handle, buffer, 0, buffer.length, 0);
      const match = /"session_id"\s*:\s*"([^"]+)"/.exec(buffer.subarray(0, read).toString('utf8'));
      return match?.[1];
    } catch {
      return undefined;
    } finally {
      if (handle !== undefined) {
        try {
          fs.closeSync(handle);
        } catch {
          // Closing a handle that is already gone is not a failure worth propagating.
        }
      }
    }
  }

  private describe(filePath: string, form: 'snapshot' | 'mirror'): AgentSourceDescriptor {
    return {
      providerId: this.id,
      clientName: 'Hermes',
      sourceKind: form === 'snapshot' ? 'custom' : 'jsonl',
      sourcePath: filePath,
      // profile is deliberately unset: no non-default profile existed on the audited machine, so populating it
      // would be a guess rather than an observation.
    };
  }

  async parse(discovered: DiscoveredSession, _context: ParseContext = {}): Promise<AgentSession> {
    const filePath = discovered.source.sourcePath;
    if (!filePath) {
      throw new Error(`cannot parse ${discovered.id}: no source path`);
    }
    return filePath.endsWith('.jsonl')
      ? parseMirror(filePath, discovered.id, discovered.source)
      : parseSnapshot(filePath, discovered.source);
  }

  /**
   * Follow a live session.
   *
   * The snapshot is REWRITTEN on each update rather than appended to, so there is no offset to resume from and
   * the whole file must be re-read. That is acceptable here in a way it was not for Codex: the largest audited
   * snapshot is a fraction of a 45 MB rollout. Deltas are computed by event count, as the Claude adapter does.
   */
  async watch(
    discovered: DiscoveredSession,
    onDelta: (delta: AgentSessionDelta) => void,
    context: WatchContext = {}
  ): Promise<Disposable> {
    const filePath = discovered.source.sourcePath;
    if (!filePath) {
      throw new Error(`cannot watch ${discovered.id}: no source path`);
    }

    let known = 0;
    const emit = async () => {
      try {
        const session = await this.parse(discovered);
        if (session.events.length > known) {
          onDelta({
            sessionId: session.id,
            appendedEvents: session.events.slice(known),
            diagnostics: session.diagnostics,
            endedAt: session.endedAt,
          });
          known = session.events.length;
        }
      } catch {
        // A read landing mid-rewrite yields invalid JSON. The next change fires again, so dropping this one
        // costs nothing; propagating it would tear the watcher down over a transient.
      }
    };

    await emit();
    return SessionFileWatcher.watch(filePath, () => void emit(), context);
  }

  getCapabilities(): AgentAdapterCapabilities {
    return {
      liveWatch: true,
      prompts: true,
      assistantMessages: true,
      shellCommands: true,
      shellOutput: true,
      fileReads: true,
      fileWrites: true,
      fileEdits: true,
      mcpCalls: false,
      subagents: true,
      // Adapter-level and still false: no Hermes session in either format carries token counts, so this is a
      // property of the provider rather than of a particular session.
      tokenUsage: false,
      cost: false,
      contextMetrics: false,
      reasoningMetadata: true,
    };
  }
}

export const hermesAdapter = new HermesAdapter();
