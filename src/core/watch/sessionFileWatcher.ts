import * as fs from 'fs';
import * as path from 'path';
import { Disposable, WatchContext } from '../adapters/agentAdapter';

/**
 * Live watching for a session file and the sibling directory a provider may put subagents in.
 *
 * Provider-neutral by name and by behaviour: it was written for Claude, and the moment the Codex adapter
 * needed the same debouncing and size deduplication it moved here rather than being copied. A file watcher
 * that lives under one provider is a file watcher the next provider reimplements slightly differently.
 *
 * Extracted from sessionWebviewProviderReact, where it lived inside a UI class (finding F4). Watch logic in a
 * webview provider cannot be reused by another provider, cannot be tested without an extension host, and ties
 * the lifetime of a filesystem handle to the lifetime of a panel.
 *
 * The subagents directory is watched separately and lazily: it is created only when a session spawns one, so a
 * watcher registered at session start would have nothing to attach to.
 */
export class SessionFileWatcher {
  /**
   * Watch a session file, calling back on every settled change.
   *
   * Debounced because a transcript is appended to far faster than any consumer can usefully react, and each
   * append fires an event. Without coalescing, a busy session re-reads its own file dozens of times a second.
   */
  static watch(sessionFilePath: string, onChange: () => void, context: WatchContext = {}): Disposable {
    const debounceMs = context.debounceMs ?? 250;
    const watchers: fs.FSWatcher[] = [];
    let timer: NodeJS.Timeout | undefined;
    let disposed = false;

    const fire = () => {
      if (disposed) {
        return;
      }
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = undefined;
        if (!disposed) {
          onChange();
        }
      }, debounceMs);
    };

    const add = (target: string, recursive = false) => {
      try {
        watchers.push(fs.watch(target, { recursive }, fire));
      } catch {
        // A path that cannot be watched is a normal condition — the file may be rotated, the directory may not
        // exist yet. Failing to watch must not fail the session; the consumer simply gets no live updates.
      }
    };

    // Skip a change that did not grow the file: a touch or a metadata update is not new content, and
    // re-reading on one costs a full parse for nothing.
    let lastSize = -1;
    const onSessionChange = () => {
      try {
        const size = fs.statSync(sessionFilePath).size;
        if (size === lastSize) {
          return;
        }
        lastSize = size;
      } catch {
        return;
      }
      mountSubagents();
      fire();
    };

    try {
      watchers.push(fs.watch(sessionFilePath, onSessionChange));
    } catch {
      // Unwatchable path: the consumer gets no live updates, which is degraded but not broken.
    }

    // <projectDir>/<sessionId>/subagents/ sits beside the session file, and Claude creates it only when the
    // session first spawns an agent. Mounting it once at subscribe time would therefore miss every subagent in
    // a session that had not spawned one yet — which is most sessions at the moment a user opens them. Retry
    // the mount on every change instead, and short-circuit once it succeeds.
    const dir = path.dirname(sessionFilePath);
    const sessionId = path.basename(sessionFilePath, '.jsonl');
    const subagentsDir = path.join(dir, sessionId, 'subagents');
    let subagentsMounted = false;

    const mountSubagents = () => {
      if (subagentsMounted || !fs.existsSync(subagentsDir)) {
        return;
      }
      const before = watchers.length;
      add(subagentsDir, true);
      subagentsMounted = watchers.length > before;
    };
    mountSubagents();

    const onAbort = () => dispose();
    context.signal?.addEventListener('abort', onAbort, { once: true });

    function dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          // Closing an already-closed watcher is not a failure worth propagating during teardown.
        }
      }
      watchers.length = 0;
      context.signal?.removeEventListener('abort', onAbort);
    }

    return { dispose };
  }
}
