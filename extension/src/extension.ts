import { join } from 'node:path';
import * as vscode from 'vscode';
import { AiCommandHandler } from './ai/commands.js';
import { type Baseline, EmptyBaseline, GitHeadBaseline } from './change-detection/baseline.js';
import { DocumentWatcher } from './change-detection/watcher.js';
import { registerCommands } from './commands.js';
import { InlineDecorations } from './decorations/inline.js';
import { disposeFocusMode, setSnapshotForFocus } from './focus-mode.js';
import { clearGitDetectCache } from './git-detect.js';
import { logger } from './logger.js';
import { prepareGrammars } from './parsers/tree-sitter/grammar-cache.js';
import { setGrammarRoot } from './parsers/tree-sitter/init.js';
import { Pipeline } from './pipeline.js';
import { SidePanelProvider } from './side-panel-provider.js';
import { StatusBar } from './status-bar.js';
import { FeedbackStore } from './storage/feedback-store.js';
import { telemetry } from './telemetry/index.js';
import { WorkspaceEngineRouter } from './workspace-router.js';

const PRELOAD_GRAMMARS = [
  'python',
  'typescript',
  'tsx',
  'javascript',
  'go',
  'java',
  'kotlin',
  'rust',
  'csharp',
  'php',
  'scala',
  'objc',
  'lua',
  'elixir',
  'powershell',
  'fsharp',
  'dart',
  'swift',
  'r',
  'gdscript',
] as const;

let pipeline: Pipeline | undefined;
let watcher: DocumentWatcher | undefined;
let provider: SidePanelProvider | undefined;
let statusBar: StatusBar | undefined;
let decorations: InlineDecorations | undefined;
let engineRouter: WorkspaceEngineRouter | undefined;

export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
  // Mark first so diagnostics deltas are honest.
  const { markActivation } = await import('./diagnostics.js');
  markActivation();

  logger.init(context);
  telemetry.init(context);
  telemetry.send({ name: 'extension.activated', props: { vscodeVersion: vscode.version } });
  logger.info('ImpactFlow activating…');

  setGrammarRoot(join(context.extensionUri.fsPath, 'dist', 'grammars'));
  try {
    await prepareGrammars([...PRELOAD_GRAMMARS]);
  } catch (err) {
    logger.error(`tree-sitter grammar load failed: ${(err as Error).message}`);
    // Continue activation; per-file analysis will surface errors individually.
  }

  const baseline = chooseBaseline();
  const feedback = new FeedbackStore(context);
  engineRouter = new WorkspaceEngineRouter(context);
  pipeline = new Pipeline(baseline, feedback, engineRouter);
  const ai = new AiCommandHandler();
  provider = new SidePanelProvider(context, pipeline, feedback, ai);

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
    for (const f of snap.files) {
      for (const m of f.modified) {
        const s = m.topSeverity ?? 'low';
        if (s === 'high' || s === 'medium' || s === 'low') counts[s]++;
      }
    }
    telemetry.send({
      name: 'analysis.completed',
      props: { fileCount: snap.files.length, ...counts, durationMs: snap.durationMs },
    });
    import('./webhook.js')
      .then(({ notifyHighRisk }) => notifyHighRisk(snap))
      .catch((err) => logger.warn(`webhook notify failed: ${(err as Error).message}`));
  });

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      pipeline
        ?.analyzeOpenDocuments()
        .catch((err) => logger.error('analyzeOpenDocuments on editor-change failed', err));
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      clearGitDetectCache();
    }),
  );

  registerCommands({ context, provider, pipeline, watcher, feedback, ai });

  await pipeline
    .analyzeOpenDocuments()
    .catch((err) => logger.error('initial analysis failed', err));

  logger.info('ImpactFlow activated.');
};

export const deactivate = () => {
  logger.info('ImpactFlow deactivating.');
  watcher?.dispose();
  statusBar?.dispose();
  decorations?.dispose();
  engineRouter?.dispose();
  disposeFocusMode();
  watcher = undefined;
  pipeline = undefined;
  provider = undefined;
  statusBar = undefined;
  decorations = undefined;
  engineRouter = undefined;
};

const chooseBaseline = (): Baseline => {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const first = folders[0];
  if (!first) return new EmptyBaseline();
  return new GitHeadBaseline(first.uri.fsPath);
};
