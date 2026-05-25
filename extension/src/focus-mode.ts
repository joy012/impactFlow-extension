import * as vscode from 'vscode';
import type { AnalysisSnapshot } from './shared/messages.js';

const CONTEXT_LINES = 10;

let dimType: vscode.TextEditorDecorationType | undefined;
let active = false;
let lastSnapshot: AnalysisSnapshot | undefined;
let editorChangeSub: vscode.Disposable | undefined;

const ensureDecoration = (): vscode.TextEditorDecorationType => {
  if (!dimType) {
    dimType = vscode.window.createTextEditorDecorationType({
      opacity: '0.35',
      isWholeLine: true,
    });
  }
  return dimType;
};

export const setSnapshotForFocus = (snap: AnalysisSnapshot): void => {
  lastSnapshot = snap;
  if (active) refreshAll();
};

export const toggleFocusMode = async (): Promise<void> => {
  active = !active;
  if (!active) {
    clearAll();
    editorChangeSub?.dispose();
    editorChangeSub = undefined;
    vscode.window.setStatusBarMessage('ImpactFlow: focus mode off.', 1500);
    return;
  }
  // B5 — dim newly-opened editors immediately, not on next snapshot.
  editorChangeSub = vscode.window.onDidChangeVisibleTextEditors(() => refreshAll());
  refreshAll();
  vscode.window.setStatusBarMessage('ImpactFlow: focus mode on — unrelated lines dimmed.', 2500);
};

const refreshAll = (): void => {
  for (const editor of vscode.window.visibleTextEditors) refreshEditor(editor);
};

const refreshEditor = (editor: vscode.TextEditor): void => {
  const deco = ensureDecoration();
  const file = lastSnapshot?.files.find((f) => f.path === editor.document.uri.fsPath);
  if (!file) {
    editor.setDecorations(deco, []);
    return;
  }
  const interesting = new Set<number>();
  for (const fn of [...file.modified, ...file.added]) {
    interesting.add(fn.line);
    for (let k = 1; k <= CONTEXT_LINES; k++) {
      interesting.add(fn.line - k);
      interesting.add(fn.line + k);
    }
  }
  const dimRanges: vscode.Range[] = [];
  for (let i = 0; i < editor.document.lineCount; i++) {
    if (interesting.has(i + 1)) continue;
    dimRanges.push(editor.document.lineAt(i).range);
  }
  editor.setDecorations(deco, dimRanges);
};

const clearAll = (): void => {
  if (!dimType) return;
  for (const editor of vscode.window.visibleTextEditors) editor.setDecorations(dimType, []);
};

export const disposeFocusMode = (): void => {
  dimType?.dispose();
  dimType = undefined;
  editorChangeSub?.dispose();
  editorChangeSub = undefined;
  active = false;
};
