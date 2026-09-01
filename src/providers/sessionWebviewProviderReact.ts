import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SessionFileWatcher } from '../core/watch/sessionFileWatcher';
import { Disposable } from '../core/adapters/agentAdapter';
import { ParserService } from '../services/parserService';
import { AnalyzerService } from '../services/analyzerService';
import { DiscoveryService } from '../services/discoveryService';
import { SessionDetail } from '../types/models';

export class SessionWebviewProviderReact {
  private panels: Map<string, vscode.WebviewPanel> = new Map();
  private watchHandles: Map<string, Disposable> = new Map();

  constructor(
    private context: vscode.ExtensionContext,
    private discoveryService: DiscoveryService,
    private parserService: ParserService,
    private analyzerService: AnalyzerService
  ) {}

  async openSessionDetail(sessionId: string): Promise<void> {
    return this.openSessionTab(sessionId, 'overview');
  }

  async openSessionTab(sessionId: string, tabType: string): Promise<void> {
    const panelKey = `${sessionId}`;

    // Check if panel already exists
    const existingPanel = this.panels.get(panelKey);
    if (existingPanel) {
      existingPanel.reveal();
      return;
    }

    // Load session data
    const sessionData = await this.loadSessionData(sessionId);
    if (!sessionData) {
      vscode.window.showErrorMessage('Failed to load session data');
      return;
    }

    // Create webview panel
    const panel = vscode.window.createWebviewPanel(
      'argusSession',
      `Argus: ${sessionData.prompt.substring(0, 30)}...`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, 'out', 'webview')),
        ],
      }
    );

    // Set HTML content
    panel.webview.html = this.getWebviewContent(panel.webview);

    // Send session data to webview
    panel.webview.postMessage({
      type: 'sessionData',
      data: sessionData,
    });

    // Send top-level directory listing for the session cwd
    this.sendDirectoryTree(panel, sessionData.project);

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'ready':
            // Webview is ready, send data
            panel.webview.postMessage({
              type: 'sessionData',
              data: sessionData,
            });
            panel.webview.postMessage({ type: 'liveMode', active: true });
            this.sendDirectoryTree(panel, sessionData.project);
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    // Track panel
    this.panels.set(panelKey, panel);

    // Start watching the JSONL file for live updates
    this.startWatching(sessionId, panel);

    // Clean up when panel is closed
    panel.onDidDispose(() => {
      this.stopWatching(sessionId);
      this.panels.delete(panelKey);
    });
  }

  async openDashboard(): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      'argusDashboard',
      'Argus Dashboard',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    const sessions = await this.discoveryService.getSessionList();

    panel.webview.html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: var(--vscode-font-family);
              color: var(--vscode-foreground);
              background: var(--vscode-editor-background);
              padding: 20px;
            }
            h1 { color: var(--vscode-foreground); }
          </style>
        </head>
        <body>
          <h1>📊 Argus Dashboard</h1>
          <p>${sessions.length} sessions found</p>
        </body>
      </html>
    `;
  }

  private startWatching(sessionId: string, panel: vscode.WebviewPanel): void {
    const sessionInfo = this.discoveryService.getSessionFilePath(sessionId);
    if (!sessionInfo) {
      return;
    }

    // Watching moved out of this class into the Claude adapter (finding F4). Watch logic living in a UI
    // provider cannot be reused by another provider, cannot be tested without an extension host, and ties a
    // filesystem handle to the lifetime of a panel. Debouncing, size deduplication and the lazy mount of the
    // subagents/ directory now live in SessionFileWatcher; this class only decides what to do when it fires.
    const reload = async () => {
      try {
        const updatedData = await this.loadSessionData(sessionId);
        if (updatedData) {
          panel.webview.postMessage({ type: 'sessionData', data: updatedData });
        }
      } catch (err) {
        console.error('Error reloading session for live update:', err);
      }
    };

    try {
      this.watchHandles.set(
        sessionId,
        SessionFileWatcher.watch(sessionInfo.filePath, () => void reload(), { debounceMs: 500 })
      );
      panel.webview.postMessage({ type: 'liveMode', active: true });
    } catch (err) {
      console.error('Failed to start file watcher:', err);
    }
  }

  private sendDirectoryTree(panel: vscode.WebviewPanel, cwd: string): void {
    if (!cwd) {
      return;
    }
    try {
      if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
        return;
      }
      const entries = fs.readdirSync(cwd, { withFileTypes: true })
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => ({
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      panel.webview.postMessage({
        type: 'directoryTree',
        cwd,
        entries,
      });
    } catch (err) {
      console.error('Failed to read directory tree:', err);
    }
  }

  private stopWatching(sessionId: string): void {
    const handle = this.watchHandles.get(sessionId);
    if (handle) {
      handle.dispose();
      this.watchHandles.delete(sessionId);
    }
  }

  private async loadSessionData(sessionId: string): Promise<SessionDetail | null> {
    try {
      console.log('🔍 Loading session:', sessionId);

      const sessionInfo = this.discoveryService.getSessionFilePath(sessionId);
      if (!sessionInfo) {
        console.error('❌ Session info not found for:', sessionId);
        return null;
      }

      console.log('📂 Session file:', sessionInfo.filePath);

      // Parse JSONL file
      const events = await this.parserService.parseFile(sessionInfo.filePath);
      console.log('📊 Parsed events:', events.length);

      if (!events.length) {
        console.error('❌ No events found in session file');
        return null;
      }

      // Get metadata
      const metadata = await this.parserService.quickMetadataWithPrompt(sessionInfo.filePath);
      const prompt = metadata?.prompt || '';
      const project = metadata?.cwd || '';
      console.log('📝 Prompt:', prompt);

      // Build session
      console.log('🔨 Building session...');
      const session = this.parserService.buildSession(events, sessionId, prompt, project);
      console.log('✅ Session built:', session.steps.length, 'steps');

      // Parse subagents
      console.log('🤖 Parsing subagents...');
      const subagents = await this.parserService.parseSubagents(sessionInfo.projectDir, sessionId);
      session.subagents = subagents;
      // Link each subagent to the Task tool_use step that spawned it so the
      // webview can interleave its steps inline in the timeline.
      this.parserService.linkSubagentsToParents(session.steps, subagents);
      console.log('✅ Subagents parsed:', subagents.length);

      // Run analysis
      console.log('🔬 Running analysis...');
      session.analysis = this.analyzerService.analyze(session);
      console.log('✅ Analysis complete:', session.analysis.findings.length, 'findings');

      // Analyze subagents
      for (const subagent of session.subagents) {
        const subSession: SessionDetail = {
          sessionId: subagent.agentId,
          // A subagent belongs to the same provider as its parent, and can prove exactly what the parent can.
          providerId: session.providerId,
          providerName: session.providerName,
          capabilities: session.capabilities,
          prompt: subagent.prompt,
          project: '',
          model: subagent.model,
          startTime: new Date(),
          endTime: new Date(),
          durationMs: 0,
          totalCost: subagent.totalCost,
          steps: subagent.steps,
          subagents: [],
          filesRead: [],
          filesWritten: [],
          toolsUsed: {},
        };
        subagent.analysis = this.analyzerService.analyze(subSession);
      }

      console.log('✅ Session loaded successfully');
      return session;
    } catch (error) {
      console.error('❌ Error loading session:', error);
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      return null;
    }
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const webviewPath = path.join(this.context.extensionPath, 'out', 'webview');
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewPath, 'assets', 'main.js'))
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewPath, 'assets', 'main.css'))
    );

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource}; font-src ${webview.cspSource} https:; img-src ${webview.cspSource} https:;">
    <link rel="stylesheet" href="${styleUri}">
    <title>Argus Session Viewer</title>
  </head>
  <body>
    <div id="root"></div>
    <script src="${scriptUri}"></script>
  </body>
</html>`;
  }
}
