import * as vscode from 'vscode';
import type { DocumentWatcher } from './change-detection/watcher.js';
import { logger } from './logger.js';
import type { Pipeline } from './pipeline.js';
import type { SidePanelProvider } from './side-panel-provider.js';
import type { FeedbackStore } from './storage/feedback-store.js';

type CommandHandler = (...args: unknown[]) => unknown;

interface CommandDeps {
  context: vscode.ExtensionContext;
  provider: SidePanelProvider;
  pipeline: Pipeline;
  watcher: DocumentWatcher;
  feedback: FeedbackStore;
}

export const registerCommands = (deps: CommandDeps): void => {
  const { context } = deps;
  const reg = (id: string, fn: CommandHandler) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  reg('impactflow.analyzeNow', analyzeNowHandler(deps));
  reg('impactflow.summarizeStaged', summarizeStagedHandler());
  reg('impactflow.sendFeedback', () => deps.provider.showFeedback('general'));
  reg('impactflow.reportBug', () => deps.provider.showFeedback('bug'));
  reg('impactflow.requestFeature', () => deps.provider.showFeedback('feature'));
  reg('impactflow.showPerf', showPerfHandler(deps.pipeline));
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

const showPerfHandler = (pipeline: Pipeline) => () => {
  const s = pipeline.perfStats();
  vscode.window.showInformationMessage(
    `ImpactFlow perf — samples=${s.samples}, last=${fmt(s.last)}ms, p50=${fmt(s.p50)}ms, p95=${fmt(s.p95)}ms`,
  );
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
  feedback.clearDismissals();
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

const fmt = (n: number | null): string => (n == null ? '–' : n.toFixed(1));
