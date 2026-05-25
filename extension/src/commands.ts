import * as vscode from 'vscode';
import type { AiCommandHandler } from './ai/commands.js';
import type { DocumentWatcher } from './change-detection/watcher.js';
import { logger } from './logger.js';
import type { Pipeline } from './pipeline.js';
import type { FnSummary } from './shared/messages.js';
import type { SidePanelProvider } from './side-panel-provider.js';
import type { FeedbackStore } from './storage/feedback-store.js';

type CommandHandler = (...args: unknown[]) => unknown;

interface CommandDeps {
  context: vscode.ExtensionContext;
  provider: SidePanelProvider;
  pipeline: Pipeline;
  watcher: DocumentWatcher;
  feedback: FeedbackStore;
  ai: AiCommandHandler;
}

export const registerCommands = (deps: CommandDeps) => {
  const { context } = deps;
  const reg = (id: string, fn: CommandHandler) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  reg('impactflow.analyzeNow', analyzeNowHandler(deps));
  reg('impactflow.summarizeStaged', summarizeStagedHandler());
  reg('impactflow.sendFeedback', () => deps.provider.showFeedback('general'));
  reg('impactflow.reportBug', () => deps.provider.showFeedback('bug'));
  reg('impactflow.requestFeature', () => deps.provider.showFeedback('feature'));
  reg('impactflow.showPerf', showPerfHandler(deps));
  reg('impactflow.resetBaseline', resetBaselineHandler(deps.pipeline));
  reg('impactflow.findDeadCode', findDeadCodeHandler());
  reg('impactflow.cleanupDeadCode', cleanupDeadCodeHandler());
  reg('impactflow.compareBranches', compareBranchesHandler());
  reg('impactflow.refreshCoverage', refreshCoverageHandler(deps.pipeline));
  reg('impactflow.toggleFocusMode', toggleFocusModeHandler());
  reg('impactflow.installPreCommit', installPreCommitHandler('warn'));
  reg('impactflow.installPreCommitBlock', installPreCommitHandler('block'));
  reg('impactflow.uninstallPreCommit', uninstallPreCommitHandler());
  reg('impactflow.draftCommitMessage', draftCommitMessageHandler());
  reg('impactflow.draftPrDescription', draftPrDescriptionHandler());
  reg('impactflow.resetDismissals', resetDismissalsHandler(deps.feedback, deps.pipeline));

  reg('impactflow.ai.explainChange', () =>
    deps.ai.run('explain', () => pickFunction(deps.pipeline)),
  );
  reg('impactflow.ai.suggestTests', () => deps.ai.run('tests', () => pickFunction(deps.pipeline)));
  reg('impactflow.ai.reviewHighRisk', () =>
    deps.ai.run('review', () => pickHighRiskFunction(deps.pipeline)),
  );
  reg('impactflow.ai.clearCache', () => deps.ai.clearCache());
  reg('impactflow.ai.updateDocs', () =>
    deps.ai.run('updateDocs', () => pickFunction(deps.pipeline)),
  );
  reg('impactflow.ai.whyRisk', () => deps.ai.run('whyRisk', () => pickFunction(deps.pipeline)));
  reg('impactflow.ai.triage', () =>
    deps.ai.runTriage(() => {
      const items = deps.pipeline.currentModifiedFunctions();
      // Re-shape from flat list back into the file-grouped snapshot the prompt expects.
      const byFile = new Map<string, ReturnType<typeof deps.pipeline.currentModifiedFunctions>>();
      for (const it of items) {
        const arr = byFile.get(it.filePath) ?? [];
        arr.push(it);
        byFile.set(it.filePath, arr);
      }
      return Array.from(byFile.entries()).map(([path, modList]) => ({
        path,
        added: [],
        modified: modList.map((m) => m.fn),
        removed: [],
      }));
    }),
  );

  reg('impactflow.jumpToFn', jumpToFnHandler(deps.pipeline));
  reg('impactflow.cycleSeverity', cycleSeverityHandler());
  reg('impactflow.showCallerTree', showCallerTreeHandler(deps.pipeline));
  reg('impactflow.showCallerTreeVisual', showCallerTreeVisualHandler(deps));
};

const showCallerTreeVisualHandler = (deps: CommandDeps) => async () => {
  const entry = await pickFunction(deps.pipeline);
  if (!entry) return;
  const { showCallerTreePanel } = await import('./impact/tree-panel.js');
  await showCallerTreePanel(deps.context, {
    filePath: entry.filePath,
    fnName: entry.fn.name,
    startLine: entry.fn.line,
  });
};

const showCallerTreeHandler = (pipeline: Pipeline) => async () => {
  const entry = await pickFunction(pipeline);
  if (!entry) return;
  const { buildCallerTree, renderTreeMarkdown } = await import('./impact/tree.js');
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `ImpactFlow: caller tree for ${entry.fn.name}…`,
      cancellable: true,
    },
    async (_p, token) => {
      const tree = await buildCallerTree({
        filePath: entry.filePath,
        fnName: entry.fn.name,
        startLine: entry.fn.line,
        token,
      });
      if (token.isCancellationRequested) return;
      const md = renderTreeMarkdown(tree, folder);
      const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: md });
      await vscode.window.showTextDocument(doc, { preview: true });
    },
  );
};

const jumpToFnHandler = (pipeline: Pipeline) => async () => {
  const items = pipeline.currentModifiedFunctions();
  if (items.length === 0) {
    vscode.window.showInformationMessage(
      'ImpactFlow: no modified functions in the current snapshot.',
    );
    return;
  }
  const picked = await vscode.window.showQuickPick(
    items.map((it) => ({
      label: it.fn.name,
      description: `${it.fn.topSeverity ?? '–'} · risk ${it.fn.risk?.score?.toFixed(1) ?? '–'}`,
      detail: shortenPath(it.filePath),
      filePath: it.filePath,
      line: it.fn.line,
    })),
    {
      title: 'ImpactFlow — jump to a modified function',
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  if (!picked) return;
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(picked.filePath));
  const editor = await vscode.window.showTextDocument(doc, { preview: false });
  const pos = new vscode.Position(Math.max(0, picked.line - 1), 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
};

const SEVERITY_CYCLE: ReadonlyArray<'all' | 'low' | 'medium' | 'high'> = [
  'all',
  'low',
  'medium',
  'high',
];

const cycleSeverityHandler = () => async () => {
  const cfg = vscode.workspace.getConfiguration('impactflow.severity');
  const current = cfg.get<'all' | 'low' | 'medium' | 'high'>('show', 'medium');
  const idx = SEVERITY_CYCLE.indexOf(current);
  const next = SEVERITY_CYCLE[(idx + 1) % SEVERITY_CYCLE.length]!;
  await cfg.update('show', next, vscode.ConfigurationTarget.Workspace);
  vscode.window.setStatusBarMessage(`ImpactFlow severity → ${next}`, 1500);
};

// Quick Pick over the snapshot's modified functions. Returns a thunk that the
// AiCommandHandler can call once the user has confirmed enabling AI.
const pickFunction = async (
  pipeline: Pipeline,
): Promise<{ fn: FnSummary; filePath: string } | undefined> => {
  const items = pipeline.currentModifiedFunctions();
  if (items.length === 0) {
    vscode.window.showInformationMessage(
      'ImpactFlow: no modified functions in the current snapshot. Edit a file first.',
    );
    return undefined;
  }
  if (items.length === 1) return items[0];
  const picked = await vscode.window.showQuickPick(
    items.map((it) => ({
      label: it.fn.name,
      description: `risk ${it.fn.risk?.score?.toFixed(1) ?? '–'} · ${it.fn.topSeverity ?? '–'}`,
      detail: shortenPath(it.filePath),
      item: it,
    })),
    { title: 'ImpactFlow — pick a modified function' },
  );
  return picked?.item;
};

const pickHighRiskFunction = async (
  pipeline: Pipeline,
): Promise<{ fn: FnSummary; filePath: string } | undefined> => {
  const high = pipeline.currentModifiedFunctions().filter((it) => it.fn.topSeverity === 'high');
  if (high.length === 0) {
    vscode.window.showInformationMessage(
      'ImpactFlow: no HIGH-risk changes in the current snapshot.',
    );
    return undefined;
  }
  if (high.length === 1) return high[0];
  const picked = await vscode.window.showQuickPick(
    high.map((it) => ({
      label: it.fn.name,
      description: `risk ${it.fn.risk?.score?.toFixed(1) ?? '–'}`,
      detail: shortenPath(it.filePath),
      item: it,
    })),
    { title: 'ImpactFlow — pick a HIGH-risk function' },
  );
  return picked?.item;
};

const analyzeNowHandler =
  ({ provider, pipeline, watcher }: CommandDeps) =>
  async () => {
    provider.reveal();
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      watcher.trigger(editor.document.uri.fsPath);
      return;
    }
    if ((vscode.workspace.workspaceFolders ?? []).length === 0) {
      vscode.window.showWarningMessage('ImpactFlow: open a folder to run analysis.');
      return;
    }
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'ImpactFlow: analyzing…',
        cancellable: true,
      },
      async (_p, token) => pipeline.analyzeOpenDocuments(token),
    );
    logger.info('Command: analyzeNow');
  };

const summarizeStagedHandler = () => async () => {
  if ((vscode.workspace.workspaceFolders ?? []).length === 0) {
    vscode.window.showWarningMessage('ImpactFlow: open a folder to summarize changes.');
    return;
  }
  const { generateCommitSummary } = await import('./commit-summary.js');
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: 'ImpactFlow: summarizing changes…',
      cancellable: true,
    },
    async (_p, token) => {
      try {
        const md = await generateCommitSummary();
        if (token.isCancellationRequested) return;
        const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: md });
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch (err) {
        logger.error('summarizeStaged failed', err);
        vscode.window.showErrorMessage(
          `ImpactFlow: could not summarize changes (${(err as Error).message}).`,
        );
      }
    },
  );
};

const showPerfHandler =
  ({ pipeline }: CommandDeps) =>
  async () => {
    const { renderDiagnostics } = await import('./diagnostics.js');
    const md = renderDiagnostics(pipeline);
    const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: md });
    await vscode.window.showTextDocument(doc, { preview: true });
  };

const resetBaselineHandler = (pipeline: Pipeline) => async () => {
  try {
    await pipeline.reset();
    vscode.window.showInformationMessage('ImpactFlow baseline reset.');
  } catch (err) {
    logger.error('resetBaseline failed', err);
    vscode.window.showErrorMessage(
      `ImpactFlow: baseline reset failed (${(err as Error).message}).`,
    );
  }
};

const findDeadCodeHandler = () => async () => {
  if ((vscode.workspace.workspaceFolders ?? []).length === 0) {
    vscode.window.showWarningMessage('ImpactFlow: open a folder before scanning for dead code.');
    return;
  }
  const { scanDeadCode } = await import('./dead-code/scan.js');
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'ImpactFlow: scanning for dead code…',
      cancellable: true,
    },
    async (_p, token) => {
      try {
        const report = await scanDeadCode(token);
        if (token.isCancellationRequested) return;
        if (report.findings.length === 0 && report.scanned === 0) {
          vscode.window.showWarningMessage(
            report.skipped[0]?.reason ?? 'Dead-code scan found nothing to analyze.',
          );
          return;
        }
        if (report.findings.length === 0) {
          vscode.window.showInformationMessage(
            `ImpactFlow: no obvious dead exports across ${report.scanned} files (${report.durationMs} ms).`,
          );
          return;
        }
        const doc = await vscode.workspace.openTextDocument({
          language: 'markdown',
          content: renderDeadCodeReport(report),
        });
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch (err) {
        logger.error('findDeadCode failed', err);
        vscode.window.showErrorMessage(
          `ImpactFlow: dead-code scan failed (${(err as Error).message}).`,
        );
      }
    },
  );
};

const cleanupDeadCodeHandler = () => async () => {
  const { runDeadCodeCleanup } = await import('./dead-code/cleanup.js');
  await runDeadCodeCleanup();
};

const compareBranchesHandler = () => async () => {
  const { runBranchCompare } = await import('./branch-compare.js');
  await runBranchCompare();
};

const refreshCoverageHandler = (pipeline: Pipeline) => async () => {
  const refreshed = await pipeline.refreshCoverage();
  if (refreshed) vscode.window.showInformationMessage('ImpactFlow: coverage reloaded.');
  else
    vscode.window.showWarningMessage(
      'No coverage/lcov.info found. Run your test runner with lcov reporter first.',
    );
};

const toggleFocusModeHandler = () => async () => {
  const { toggleFocusMode } = await import('./focus-mode.js');
  await toggleFocusMode();
};

const installPreCommitHandler = (mode: 'warn' | 'block') => async () => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage('ImpactFlow: open a folder to install the pre-commit hook.');
    return;
  }
  const { installPreCommitHook } = await import('./git-hooks/pre-commit.js');
  const result = await installPreCommitHook(folder.uri.fsPath, mode);
  if (result.installed) vscode.window.showInformationMessage(result.message);
  else vscode.window.showWarningMessage(result.message);
};

const uninstallPreCommitHandler = () => async () => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage('ImpactFlow: open a folder first.');
    return;
  }
  const { uninstallPreCommitHook } = await import('./git-hooks/pre-commit.js');
  const result = await uninstallPreCommitHook(folder.uri.fsPath);
  vscode.window.showInformationMessage(result.message);
};

const draftCommitMessageHandler = () => async () => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage('ImpactFlow: open a folder first.');
    return;
  }
  const { draftCommitMessage } = await import('./drafts.js');
  const msg = await draftCommitMessage(folder.uri.fsPath);
  await vscode.env.clipboard.writeText(msg);
  vscode.window.showInformationMessage('ImpactFlow: commit message copied to clipboard.');
};

const draftPrDescriptionHandler = () => async () => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage('ImpactFlow: open a folder first.');
    return;
  }
  const { draftPrDescription } = await import('./drafts.js');
  const md = await draftPrDescription(folder.uri.fsPath);
  await vscode.env.clipboard.writeText(md);
  const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: md });
  await vscode.window.showTextDocument(doc, { preview: true });
};

const resetDismissalsHandler = (feedback: FeedbackStore, pipeline: Pipeline) => async () => {
  const confirm = await vscode.window.showWarningMessage(
    'Clear all dismissed ImpactFlow findings? This will re-surface anything you previously hid.',
    { modal: true },
    'Clear',
  );
  if (confirm !== 'Clear') return;
  await feedback.clearDismissals();
  await pipeline.reset();
  vscode.window.showInformationMessage('ImpactFlow: dismissals cleared.');
};

interface DeadCodeReportSummary {
  generatedAt: number;
  durationMs: number;
  scanned: number;
  findings: Array<{ filePath: string; symbol: string; line: number; kind: string; reason: string }>;
  skipped: Array<{ filePath: string; reason: string }>;
}

const renderDeadCodeReport = (report: DeadCodeReportSummary): string => {
  const lines: string[] = [
    '# ImpactFlow — Dead-Code Report',
    '',
    `Scanned **${report.scanned}** files in ${report.durationMs} ms · Found **${report.findings.length}** candidates`,
    '',
    '> Read-only report. Removal requires preview + confirm (`ImpactFlow: Cleanup Dead Code`).',
    '',
  ];
  if (report.findings.length === 0) {
    lines.push('_No dead exports detected._');
  } else {
    lines.push('## Candidates');
    for (const f of report.findings) {
      lines.push(
        `- **${f.symbol}** (${f.kind}) — \`${shortenPath(f.filePath)}:${f.line}\` — ${f.reason}`,
      );
    }
  }
  if (report.skipped.length > 0) {
    lines.push('', '## Skipped');
    for (const s of report.skipped) {
      lines.push(`- \`${shortenPath(s.filePath)}\` — ${s.reason}`);
    }
  }
  return lines.join('\n');
};

const shortenPath = (abs: string): string => {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (folder && abs.startsWith(folder)) return abs.slice(folder.length + 1);
  return abs;
};
