import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AdapterDetectionContext,
  AgentAdapter,
  AgentAdapterCapabilities,
  DetectionResult,
  DiscoveredSession,
  ParseContext,
  SessionDiscoveryContext,
} from '../../core/adapters/agentAdapter';
import { AgentSession, AgentSourceDescriptor } from '../../core/models/agentSession';
import { parseRollout } from './parser';

/**
 * OpenAI Codex adapter.
 *
 * Reads rollout JSONL beneath the Codex home. The layout is date-partitioned:
 *   $CODEX_HOME/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl
 *
 * Discovery walks the date partitions rather than recursing blindly, because the Codex home also contains
 * caches, attachments and archived sessions that must not be ingested as live evidence.
 */
export class CodexAdapter implements AgentAdapter {
  readonly id = 'openai-codex';
  readonly displayName = 'OpenAI Codex';

  private codexHome(context: AdapterDetectionContext): string {
    // CODEX_HOME is the variable the Codex CLI itself honours, so a relocated home is found rather than missed.
    const fromEnv = context.env?.CODEX_HOME ?? process.env.CODEX_HOME;
    if (fromEnv && fromEnv.trim()) {
      return fromEnv;
    }
    return path.join(context.homeDir ?? os.homedir(), '.codex');
  }

  async detect(context: AdapterDetectionContext = {}): Promise<DetectionResult> {
    const roots: string[] = [];

    for (const configured of context.configuredPaths ?? []) {
      if (configured && fs.existsSync(path.join(configured, 'sessions'))) {
        roots.push(configured);
      }
    }

    if (roots.length === 0) {
      const home = this.codexHome(context);
      if (fs.existsSync(path.join(home, 'sessions'))) {
        roots.push(home);
      }
    }

    if (roots.length === 0) {
      return { available: false, roots: [], reason: 'no Codex sessions directory found' };
    }
    return { available: true, roots };
  }

  /**
   * Walk YYYY/MM/DD partitions and list rollouts.
   *
   * Bounded to three levels by construction. A recursive walk of the Codex home would descend into caches and
   * attachment stores, which is both slow and wrong: those are not sessions.
   */
  async discover(context: SessionDiscoveryContext): Promise<DiscoveredSession[]> {
    const found: DiscoveredSession[] = [];

    for (const root of context.roots) {
      const bases = [path.join(root, 'sessions')];
      if (context.includeArchived) {
        const archived = path.join(root, 'archived_sessions');
        if (fs.existsSync(archived)) {
          bases.push(archived);
        }
      }

      for (const base of bases) {
        for (const year of this.subdirs(base)) {
          for (const month of this.subdirs(path.join(base, year))) {
            for (const day of this.subdirs(path.join(base, year, month))) {
              const dir = path.join(base, year, month, day);
              let entries: fs.Dirent[];
              try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
              } catch {
                continue;
              }
              for (const entry of entries) {
                if (!entry.isFile() || !entry.name.startsWith('rollout-') || !entry.name.endsWith('.jsonl')) {
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

                const source: AgentSourceDescriptor = {
                  providerId: this.id,
                  clientName: 'Codex',
                  sourceKind: 'jsonl',
                  sourcePath: filePath,
                };
                found.push({
                  id: this.sessionIdFromFilename(entry.name),
                  providerId: this.id,
                  source,
                  updatedAt: stat.mtime.toISOString(),
                  sizeBytes: stat.size,
                });
              }
            }
          }
        }
      }
    }

    return found;
  }

  /**
   * `rollout-2026-08-31T19-26-20-<uuid>.jsonl` -> the uuid.
   *
   * The uuid is the session id Codex itself records in session_meta, so using it keeps the discovered id and
   * the parsed id the same. Falls back to the whole basename if the shape ever changes.
   */
  private sessionIdFromFilename(name: string): string {
    const match = /^rollout-.*?-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(name);
    return match ? match[1] : name.replace(/\.jsonl$/, '');
  }

  private subdirs(dir: string): string[] {
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  }

  async parse(discovered: DiscoveredSession, _context: ParseContext = {}): Promise<AgentSession> {
    const filePath = discovered.source.sourcePath;
    if (!filePath) {
      throw new Error(`cannot parse ${discovered.id}: no source path`);
    }
    return parseRollout(filePath, discovered.id, discovered.source);
  }

  getCapabilities(): AgentAdapterCapabilities {
    // Adapter-level: what Codex CAN report. Whether a PARTICULAR session did is decided during parsing, which
    // is why the parser recomputes these from what it actually saw.
    return {
      liveWatch: true,
      prompts: true,
      assistantMessages: true,
      shellCommands: true,
      shellOutput: true,
      fileReads: false,
      fileWrites: true,
      fileEdits: true,
      mcpCalls: true,
      subagents: false,
      tokenUsage: true,
      cost: true,
      contextMetrics: true,
      reasoningMetadata: true,
    };
  }
}

export const codexAdapter = new CodexAdapter();
