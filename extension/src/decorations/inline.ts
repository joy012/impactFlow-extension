/**
 * Inline gutter decorations for changed functions.
 * Phase 5.
 */

import * as vscode from 'vscode';
import type { AnalysisSnapshot, FnSummary, Severity } from '../shared/messages.js';

export class InlineDecorations implements vscode.Disposable {
  private readonly high: vscode.TextEditorDecorationType;
  private readonly medium: vscode.TextEditorDecorationType;
  private readonly low: vscode.TextEditorDecorationType;
  private readonly addedType: vscode.TextEditorDecorationType;
  private disposed = false;

  constructor(_context: vscode.ExtensionContext) {
    const make = (color: string) =>
      vscode.window.createTextEditorDecorationType({
        gutterIconPath: vscode.Uri.parse(makeSvgDataUri(color)),
        gutterIconSize: 'contain',
        overviewRulerColor: color,
        overviewRulerLane: vscode.OverviewRulerLane.Right,
      });
    this.high = make('#e25555');
    this.medium = make('#e2a23b');
    this.low = make('#7aa2f7');
    this.addedType = make('#3cb371');
  }

  apply(snapshot: AnalysisSnapshot): void {
    if (this.disposed) return;
    if (!vscode.workspace.getConfiguration('impactflow.decorations').get<boolean>('inline', true)) {
      this.clearAll();
      return;
    }
    for (const editor of vscode.window.visibleTextEditors) {
      const filePath = editor.document.uri.fsPath;
      const file = snapshot.files.find((f) => f.path === filePath);
      if (!file) {
        this.clearEditor(editor);
        continue;
      }
      const high: vscode.Range[] = [];
      const medium: vscode.Range[] = [];
      const low: vscode.Range[] = [];
      const added: vscode.Range[] = [];

      for (const fn of file.modified) {
        const range = lineRange(editor.document, fn.line);
        if (!range) continue;
        const sev: Severity = fn.topSeverity ?? 'low';
        if (sev === 'high') high.push(range);
        else if (sev === 'medium') medium.push(range);
        else low.push(range);
      }
      for (const fn of file.added) {
        const range = lineRange(editor.document, fn.line);
        if (range) added.push(range);
      }

      editor.setDecorations(this.high, high);
      editor.setDecorations(this.medium, medium);
      editor.setDecorations(this.low, low);
      editor.setDecorations(this.addedType, added);
    }
  }

  private clearEditor(editor: vscode.TextEditor): void {
    editor.setDecorations(this.high, []);
    editor.setDecorations(this.medium, []);
    editor.setDecorations(this.low, []);
    editor.setDecorations(this.addedType, []);
  }

  private clearAll(): void {
    for (const editor of vscode.window.visibleTextEditors) this.clearEditor(editor);
  }

  dispose(): void {
    this.disposed = true;
    this.high.dispose();
    this.medium.dispose();
    this.low.dispose();
    this.addedType.dispose();
  }
}

function lineRange(doc: vscode.TextDocument, line1: number): vscode.Range | undefined {
  const idx = Math.max(0, Math.min(doc.lineCount - 1, line1 - 1));
  return doc.lineAt(idx).range;
}

function makeSvgDataUri(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="3.5" fill="${color}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function summarizeForStatus(snapshot: AnalysisSnapshot): string {
  const counts: Record<Severity, number> = { safe: 0, low: 0, medium: 0, high: 0 };
  let added = 0;
  for (const f of snapshot.files) {
    added += f.added.length;
    for (const m of f.modified) {
      const s = m.topSeverity ?? 'low';
      counts[s]++;
    }
  }
  const parts: string[] = [];
  if (counts.high) parts.push(`${counts.high} high`);
  if (counts.medium) parts.push(`${counts.medium} med`);
  if (counts.low) parts.push(`${counts.low} low`);
  if (added) parts.push(`+${added}`);
  return parts.length ? `ImpactFlow: ${parts.join(' · ')}` : 'ImpactFlow: clean';
}

/** unused — re-exported for tests if needed. */
export type { FnSummary };
