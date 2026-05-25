import * as vscode from 'vscode';
import type { DocumentWatcher } from './change-detection/watcher.js';
import { logger } from './logger.js';
import type { Pipeline } from './pipeline.js';
import type { SidePanelProvider } from './side-panel-provider.js';

export function registerCommands(
  context: vscode.ExtensionContext,
  provider: SidePanelProvider,
  pipeline: Pipeline,
  watcher: DocumentWatcher,
): void {
  const reg = (id: string, fn: (...args: unknown[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  reg('impactflow.analyzeNow', async () => {
    provider.reveal();
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      watcher.trigger(editor.document.uri.fsPath);
    } else {
      const folders = vscode.workspace.workspaceFolders ?? [];
      if (folders.length === 0) {
        vscode.window.showWarningMessage('ImpactFlow: open a folder to run analysis.');
        return;
      }
      await pipeline.analyzeOpenDocuments();
    }
    logger.info('Command: analyzeNow');
  });

  reg('impactflow.summarizeStaged', async () => {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
      vscode.window.showWarningMessage('ImpactFlow: open a folder to summarize changes.');
      return;
    }
    const { generateCommitSummary } = await import('./commit-summary.js');
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'ImpactFlow: summarizing changes…' },
      async () => {
        try {
          const md = await generateCommitSummary();
          const doc = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: md,
          });
          await vscode.window.showTextDocument(doc, { preview: true });
        } catch (err) {
          logger.error('summarizeStaged failed', err);
          vscode.window.showErrorMessage(
            `ImpactFlow: could not summarize changes (${(err as Error).message}).`,
          );
        }
      },
    );
  });

  reg('impactflow.sendFeedback', () => provider.showFeedback('general'));
  reg('impactflow.reportBug', () => provider.showFeedback('bug'));
  reg('impactflow.requestFeature', () => provider.showFeedback('feature'));

  reg('impactflow.showPerf', () => {
    const s = pipeline.perfStats();
    vscode.window.showInformationMessage(
      `ImpactFlow perf — samples=${s.samples}, last=${fmt(s.last)}ms, p50=${fmt(s.p50)}ms, p95=${fmt(s.p95)}ms`,
    );
  });

  reg('impactflow.resetBaseline', async () => {
    try {
      await pipeline.reset();
      vscode.window.showInformationMessage('ImpactFlow baseline reset.');
    } catch (err) {
      logger.error('resetBaseline failed', err);
      vscode.window.showErrorMessage(
        `ImpactFlow: baseline reset failed (${(err as Error).message}).`,
      );
    }
  });

  reg('impactflow.findDeadCode', async () => {
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
  });

  reg('impactflow.compareBranches', async () => {
    const { runBranchCompare } = await import('./branch-compare.js');
    await runBranchCompare();
  });

  reg('impactflow.refreshCoverage', async () => {
    const refreshed = await pipeline.refreshCoverage();
    if (refreshed) vscode.window.showInformationMessage('ImpactFlow: coverage reloaded.');
    else
      vscode.window.showWarningMessage(
        'No coverage/lcov.info found. Run your test runner with lcov reporter first.',
      );
  });
}

function renderDeadCodeReport(report: {
  generatedAt: number;
  durationMs: number;
  scanned: number;
  findings: Array<{ filePath: string; symbol: string; line: number; kind: string; reason: string }>;
  skipped: Array<{ filePath: string; reason: string }>;
}): string {
  const lines: string[] = [];
  lines.push('# ImpactFlow — Dead-Code Report');
  lines.push('');
  lines.push(
    `Scanned **${report.scanned}** files in ${report.durationMs} ms · Found **${report.findings.length}** candidates`,
  );
  lines.push('');
  lines.push('> Read-only report. Removal requires preview + confirm (see `docs/ROADMAP.md` §E1).');
  lines.push('');
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
    lines.push('');
    lines.push('## Skipped');
    for (const s of report.skipped) {
      lines.push(`- \`${shortenPath(s.filePath)}\` — ${s.reason}`);
    }
  }
  return lines.join('\n');
}

function shortenPath(abs: string): string {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (folder && abs.startsWith(folder)) return abs.slice(folder.length + 1);
  return abs;
}

function fmt(n: number | null): string {
  return n == null ? '–' : n.toFixed(1);
}
