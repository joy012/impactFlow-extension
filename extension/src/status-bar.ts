/**
 * Status-bar item showing project-level risk pulse.
 */

import * as vscode from 'vscode';
import { summarizeForStatus } from './decorations/inline.js';
import type { AnalysisSnapshot } from './shared/messages.js';

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'impactflow.analyzeNow';
    this.item.tooltip = 'Click to open ImpactFlow';
    this.item.text = 'ImpactFlow: …';
    this.item.show();
  }

  update(snapshot: AnalysisSnapshot): void {
    this.item.text = `$(pulse) ${summarizeForStatus(snapshot)}`;
    const hasHigh = snapshot.files.some((f) => f.modified.some((m) => m.topSeverity === 'high'));
    this.item.backgroundColor = hasHigh
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined;
  }

  dispose(): void {
    this.item.dispose();
  }
}
