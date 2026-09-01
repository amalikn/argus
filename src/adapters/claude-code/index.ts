import * as fs from 'fs';
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
import { AgentSession, AgentSessionDelta, AgentSourceDescriptor, ParseDiagnostic } from '../../core/models/agentSession';
import { ParserService } from '../../services/parserService';
import { getClaudeConfigDir } from '../../utils/claudePaths';
import { normalizeSession } from './normalizer';
import { SessionFileWatcher } from '../../core/watch/sessionFileWatcher';

/**
 * The Claude Code adapter — the reference implementation of the adapter contract.
 *
 * It delegates parsing to the existing ParserService rather than reimplementing it, which is what keeps the
 * Stop 2 parity snapshots meaningful: the parse is unchanged, so any snapshot movement is a mapping bug and
 * nothing else.
 */
export class ClaudeCodeAdapter implements AgentAdapter {
  readonly id = 'claude-code';
  readonly displayName = 'Claude Code';

  constructor(private readonly parser: ParserService = new ParserService()) {}

  async detect(context: AdapterDetectionContext = {}): Promise<DetectionResult> {
    const configured = context.configuredPaths?.filter(Boolean) ?? [];
    const roots: string[] = [];

    for (const root of configured) {
      if (fs.existsSync(path.join(root, 'projects'))) {
        roots.push(root);
      }
    }

    if (roots.length === 0) {
      // Honours CLAUDE_CONFIG_DIR, the same variable the CLI itself reads, so a relocated config is found.
      const fallback = context.env?.CLAUDE_CONFIG_DIR ?? getClaudeConfigDir();
      if (fs.existsSync(path.join(fallback, 'projects'))) {
        roots.push(fallback);
      }
    }

    if (roots.length === 0) {
      return { available: false, roots: [], reason: 'no Claude Code projects directory found' };
    }
    return { available: true, roots };
  }

  /**
   * Enumerate sessions without parsing them.
   *
   * Layout is `<root>/projects/<encodedProject>/<sessionId>.jsonl`, with subagents in a sibling
   * `<sessionId>/subagents/` directory. Discovery is deliberately fixed-depth: upstream never recursed, and
   * recursing into a large home directory to find transcripts would be slow and would pick up unrelated files.
   */
  async discover(context: SessionDiscoveryContext): Promise<DiscoveredSession[]> {
    const found: DiscoveredSession[] = [];

    for (const root of context.roots) {
      const projects = path.join(root, 'projects');
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(projects, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const project of entries) {
        if (!project.isDirectory()) {
          continue;
        }
        const projectDir = path.join(projects, project.name);
        let files: fs.Dirent[];
        try {
          files = fs.readdirSync(projectDir, { withFileTypes: true });
        } catch {
          continue;
        }

        for (const file of files) {
          if (file.isDirectory() || !file.name.endsWith('.jsonl')) {
            continue;
          }
          const filePath = path.join(projectDir, file.name);
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
            clientName: 'Claude Code',
            sourceKind: 'jsonl',
            sourcePath: filePath,
          };
          found.push({
            id: file.name.replace(/\.jsonl$/, ''),
            providerId: this.id,
            source,
            projectPath: project.name,
            updatedAt: stat.mtime.toISOString(),
            sizeBytes: stat.size,
          });
        }
      }
    }

    return found;
  }

  async parse(discovered: DiscoveredSession, _context: ParseContext = {}): Promise<AgentSession> {
    const filePath = discovered.source.sourcePath;
    if (!filePath) {
      throw new Error(`cannot parse ${discovered.id}: no source path`);
    }

    const diagnostics: ParseDiagnostic[] = [];
    const events = await this.parser.parseFile(filePath);
    if (events.length === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'empty-session',
        message: 'no parseable records in transcript',
      });
    }

    const detail = this.parser.buildSession(
      events,
      discovered.id,
      discovered.title ?? '',
      discovered.projectPath ?? ''
    );

    // Subagents are sibling FILES, not inline records (finding F12), so they are read separately and linked.
    try {
      const projectDir = path.dirname(filePath);
      const subagents = await this.parser.parseSubagents(projectDir, discovered.id);
      if (subagents.length > 0) {
        detail.subagents = subagents;
        this.parser.linkSubagentsToParents(detail.steps, subagents);
      }
    } catch (err) {
      diagnostics.push({
        severity: 'info',
        code: 'subagents-unreadable',
        message: `subagent transcripts could not be read: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    return normalizeSession(detail, discovered.source, diagnostics);
  }

  async watch(
    discovered: DiscoveredSession,
    onDelta: (delta: AgentSessionDelta) => void,
    context: WatchContext = {}
  ): Promise<Disposable> {
    const filePath = discovered.source.sourcePath;
    if (!filePath) {
      throw new Error(`cannot watch ${discovered.id}: no source path`);
    }

    // Claude appends to a transcript rather than rewriting it, but a partial final line is normal mid-write.
    // Re-parsing and diffing by event count is cheap next to tracking byte offsets through a growing file, and
    // it cannot desynchronise the way an offset can when the file is rotated or rewritten.
    let known = 0;
    const emit = async () => {
      try {
        const session = await this.parse(discovered);
        if (session.events.length > known) {
          onDelta({
            sessionId: session.id,
            appendedEvents: session.events.slice(known),
            metrics: session.metrics,
            diagnostics: session.diagnostics,
            endedAt: session.endedAt,
          });
          known = session.events.length;
        }
      } catch {
        // A read that lands mid-write throws or yields a truncated record. The next change fires again, so
        // dropping this one costs nothing; propagating it would tear down the watcher over a transient.
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
      mcpCalls: true,
      subagents: true,
      tokenUsage: true,
      // Adapter-level: Claude reports usage, so cost is computable in principle. Whether a PARTICULAR session
      // can be costed depends on its model being in the pricing table, and that is decided per session.
      cost: true,
      contextMetrics: true,
      reasoningMetadata: true,
    };
  }
}

export const claudeCodeAdapter = new ClaudeCodeAdapter();
