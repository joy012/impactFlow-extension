import * as vscode from 'vscode';
import { type Baseline, EmptyBaseline, GitHeadBaseline } from './change-detection/baseline.js';
import { DocumentWatcher } from './change-detection/watcher.js';
import { registerCommands } from './commands.js';
import { CoverageEngine } from './coverage/lcov.js';
import { InlineDecorations } from './decorations/inline.js';
import { LastTouchedEngine } from './git-blame/last-touched.js';
import { HotspotEngine } from './hotspot/index.js';
import { logger } from './logger.js';
import { Pipeline } from './pipeline.js';
import { SidePanelProvider } from './side-panel-provider.js';
import { StatusBar } from './status-bar.js';
import { FeedbackStore } from './storage/feedback-store.js';
import { telemetry } from './telemetry/index.js';

let pipeline: Pipeline | undefined;
let watcher: DocumentWatcher | undefined;
let provider: SidePanelProvider | undefined;
let statusBar: StatusBar | undefined;
let decorations: InlineDecorations | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger.init(context);
  telemetry.init(context);
  telemetry.send({ name: 'extension.activated', props: { vscodeVersion: vscode.version } });
  logger.info('ImpactFlow activating…');

  const baseline = chooseBaseline();
  const feedback = new FeedbackStore(context);
  const folders = vscode.workspace.workspaceFolders ?? [];
  const workspaceRoot = folders[0]?.uri.fsPath;
  const hotspot = workspaceRoot ? new HotspotEngine(workspaceRoot) : undefined;
  const coverage = new CoverageEngine();
  const lastTouched = workspaceRoot ? new LastTouchedEngine(workspaceRoot) : undefined;
  if (workspaceRoot) {
    // Non-blocking — coverage activates when the file is present.
    void coverage
      .init(workspaceRoot, context)
      .catch((err) => logger.warn(`coverage init failed: ${(err as Error).message}`));
  }
  pipeline = new Pipeline(baseline, feedback, hotspot, coverage, lastTouched);
  provider = new SidePanelProvider(context, pipeline, feedback);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidePanelProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  watcher = new DocumentWatcher((n) => pipeline?.handleChange(n));
  watcher.start();
  context.subscriptions.push(watcher);

  statusBar = new StatusBar();
  decorations = new InlineDecorations(context);
  context.subscriptions.push(statusBar, decorations);

  pipeline.onSnapshot((snap) => {
    statusBar?.update(snap);
    decorations?.apply(snap);
    const counts = { high: 0, medium: 0, low: 0 };
    for (const f of snap.files)
      for (const m of f.modified) {
        const s = m.topSeverity ?? 'low';
        if (s === 'high' || s === 'medium' || s === 'low') counts[s]++;
      }
    telemetry.send({
      name: 'analysis.completed',
      props: { fileCount: snap.files.length, ...counts, durationMs: snap.durationMs },
    });
    // F15 — fire-and-forget webhook notification (opt-in, throttled).
    void import('./webhook.js').then(({ notifyHighRisk }) => notifyHighRisk(snap));
  });

  // Re-apply decorations when editors change.
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      void pipeline?.analyzeOpenDocuments();
    }),
  );

  registerCommands(context, provider, pipeline, watcher);

  void pipeline.analyzeOpenDocuments();

  logger.info('ImpactFlow activated.');
}

export function deactivate(): void {
  logger.info('ImpactFlow deactivating.');
  watcher?.dispose();
  statusBar?.dispose();
  decorations?.dispose();
  watcher = undefined;
  pipeline = undefined;
  provider = undefined;
  statusBar = undefined;
  decorations = undefined;
}

function chooseBaseline(): Baseline {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const first = folders[0];
  if (!first) return new EmptyBaseline();
  return new GitHeadBaseline(first.uri.fsPath);
}
