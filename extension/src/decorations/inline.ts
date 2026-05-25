import * as vscode from 'vscode';
import type { AnalysisSnapshot, FnSummary, Severity } from '../shared/messages.js';

// SVG fill colours: VS Code's SVG renderer can't resolve `--vscode-*` tokens,
// so we hard-code reasonable hexes here that read well against light + dark
// themes. The matching `overviewRulerColor` uses `ThemeColor` so the ruler
// blends with the user's editor theme.
const SVG_FILL = {
  high: '#e25555',
  medium: '#e2a23b',
  low: '#7aa2f7',
  added: '#3cb371',
} as const;

const RULER_THEME_COLOR: Record<keyof typeof SVG_FILL, vscode.ThemeColor> = {
  high: new vscode.ThemeColor('editorOverviewRuler.errorForeground'),
  medium: new vscode.ThemeColor('editorOverviewRuler.warningForeground'),
  low: new vscode.ThemeColor('editorOverviewRuler.infoForeground'),
  added: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
};

export class InlineDecorations implements vscode.Disposable {
  private readonly high: vscode.TextEditorDecorationType;
  private readonly medium: vscode.TextEditorDecorationType;
  private readonly low: vscode.TextEditorDecorationType;
  private readonly addedType: vscode.TextEditorDecorationType;
  private disposed = false;

  constructor(_context: vscode.ExtensionContext) {
    this.high = makeDecoration('high');
    this.medium = makeDecoration('medium');
    this.low = makeDecoration('low');
    this.addedType = makeDecoration('added');
  }

  apply(snapshot: AnalysisSnapshot): void {
    if (this.disposed) return;
    if (!vscode.workspace.getConfiguration('impactflow.decorations').get<boolean>('inline', true)) {
      this.clearAll();
      return;
    }
    for (const editor of vscode.window.visibleTextEditors) {
      const file = snapshot.files.find((f) => f.path === editor.document.uri.fsPath);
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
        const bucket =
          fn.topSeverity === 'high' ? high : fn.topSeverity === 'medium' ? medium : low;
        bucket.push(range);
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

const makeDecoration = (kind: keyof typeof SVG_FILL): vscode.TextEditorDecorationType =>
  vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.parse(makeSvgDataUri(SVG_FILL[kind])),
    gutterIconSize: 'contain',
    overviewRulerColor: RULER_THEME_COLOR[kind],
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });

const lineRange = (doc: vscode.TextDocument, line1: number): vscode.Range | undefined => {
  const idx = Math.max(0, Math.min(doc.lineCount - 1, line1 - 1));
  return doc.lineAt(idx).range;
};

const makeSvgDataUri = (color: string): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="3.5" fill="${color}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const summarizeForStatus = (snapshot: AnalysisSnapshot): string => {
  const counts: Record<Severity, number> = { safe: 0, low: 0, medium: 0, high: 0 };
  let added = 0;
  for (const f of snapshot.files) {
    added += f.added.length;
    for (const m of f.modified) counts[m.topSeverity ?? 'low']++;
  }
  const parts: string[] = [];
  if (counts.high) parts.push(`${counts.high} high`);
  if (counts.medium) parts.push(`${counts.medium} med`);
  if (counts.low) parts.push(`${counts.low} low`);
  if (added) parts.push(`+${added}`);
  return parts.length ? `ImpactFlow: ${parts.join(' · ')}` : 'ImpactFlow: clean';
};

export type { FnSummary };
