import { join } from 'node:path';
import * as vscode from 'vscode';
import { type Baseline, EmptyBaseline, GitHeadBaseline } from './change-detection/baseline.js';
import { DocumentWatcher } from './change-detection/watcher.js';
import { registerCommands } from './commands.js';
import { CoverageEngine } from './coverage/lcov.js';
import { InlineDecorations } from './decorations/inline.js';
import { disposeFocusMode, setSnapshotForFocus } from './focus-mode.js';
import { LastTouchedEngine } from './git-blame/last-touched.js';
import { clearGitDetectCache } from './git-detect.js';
import { HotspotEngine } from './hotspot/index.js';
import { logger } from './logger.js';
import { prepareGrammars } from './parsers/tree-sitter/grammar-cache.js';
import { setGrammarRoot } from './parsers/tree-sitter/init.js';
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

export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
  logger.init(context);
  telemetry.init(context);
  telemetry.send({ name: 'extension.activated', props: { vscodeVersion: vscode.version } });
  logger.info('ImpactFlow activating…');

  setGrammarRoot(join(context.extensionUri.fsPath, 'dist', 'grammars'));
  try {
    await prepareGrammars([
      'python', 'typescript', 'tsx', 'javascript',
      'go', 'java', 'kotlin', 'rust', 'csharp', 'php', 'scala', 'objc', 'lua', 'elixir',
    ]);
  } catch (err) {
    logger.error(`tree-sitter grammar load failed: ${(err as Error).message}`);
    // Continue activation; per-file analysis will surface errors individually.
  }

  const baseline = chooseBaseline();
  const feedback = new FeedbackStore(context);
  const folders = vscode.workspace.workspaceFolders ?? [];
  // B6 — for now we still bind these engines to the first folder. Multi-root
  // routing per-file is tracked in ROADMAP §3 B6.
  const workspaceRoot = folders[0]?.uri.fsPath;
  const hotspot = workspaceRoot ? new HotspotEngine(workspaceRoot) : undefined;
  const coverage = new CoverageEngine();
  const lastTouched = workspaceRoot ? new LastTouchedEngine(workspaceRoot) : undefined;
  if (workspaceRoot) {
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
    setSnapshotForFocus(snap);
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
    void import('./webhook.js').then(({ notifyHighRisk }) => notifyHighRisk(snap));
  });

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      void pipeline?.analyzeOpenDocuments();
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      clearGitDetectCache();
    }),
  );

  registerCommands({ context, provider, pipeline, watcher, feedback });

  void pipeline.analyzeOpenDocuments();

  logger.info('ImpactFlow activated.');
};

export const deactivate = (): void => {
  logger.info('ImpactFlow deactivating.');
  watcher?.dispose();
  statusBar?.dispose();
  decorations?.dispose();
  disposeFocusMode();
  watcher = undefined;
  pipeline = undefined;
  provider = undefined;
  statusBar = undefined;
  decorations = undefined;
};

const chooseBaseline = (): Baseline => {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const first = folders[0];
  if (!first) return new EmptyBaseline();
  return new GitHeadBaseline(first.uri.fsPath);
};
