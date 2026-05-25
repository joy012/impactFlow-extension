import * as vscode from 'vscode';
import { summarizeForStatus } from './decorations/inline.js';
import type { AnalysisSnapshot } from './shared/messages.js';

export class StatusBar implements vscode.Disposable {
  private readonly main: vscode.StatusBarItem;
  private readonly cycler: vscode.StatusBarItem;
  private readonly configDisposable: vscode.Disposable;

  constructor() {
    this.main = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.main.command = 'impactflow.analyzeNow';
    this.main.tooltip = 'Click to open ImpactFlow';
    this.main.text = 'ImpactFlow: …';
    this.main.show();

    // UX backlog — secondary status bar item that shows the current severity
    // filter; click cycles all → low → medium → high.
    this.cycler = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    this.cycler.command = 'impactflow.cycleSeverity';
    this.cycler.tooltip = 'Click to cycle ImpactFlow severity filter';
    this.refreshCycler();
    this.cycler.show();

    this.configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('impactflow.severity.show')) this.refreshCycler();
    });
  }

  update(snapshot: AnalysisSnapshot): void {
    this.main.text = `$(pulse) ${summarizeForStatus(snapshot)}`;
    const hasHigh = snapshot.files.some((f) => f.modified.some((m) => m.topSeverity === 'high'));
    this.main.backgroundColor = hasHigh
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined;
  }

  private refreshCycler(): void {
    const sev = vscode.workspace
      .getConfiguration('impactflow.severity')
      .get<string>('show', 'medium');
    this.cycler.text = `$(filter) ${sev}`;
  }

  dispose(): void {
    this.configDisposable.dispose();
    this.main.dispose();
    this.cycler.dispose();
  }
}
