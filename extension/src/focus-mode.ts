/**
 * F16 — Focus mode.
 * Toggleable command that dims lines OUTSIDE of currently-modified functions
 * in every visible editor. Cleared on second toggle.
 */

import * as vscode from 'vscode';
import type { AnalysisSnapshot } from './shared/messages.js';

let dimType: vscode.TextEditorDecorationType | undefined;
let active = false;
let lastSnapshot: AnalysisSnapshot | undefined;

function ensureDecoration(): vscode.TextEditorDecorationType {
  if (!dimType) {
    dimType = vscode.window.createTextEditorDecorationType({
      opacity: '0.35',
      isWholeLine: true,
    });
  }
  return dimType;
}

export function setSnapshotForFocus(snap: AnalysisSnapshot): void {
  lastSnapshot = snap;
  if (active) refreshAll();
}

export async function toggleFocusMode(): Promise<void> {
  active = !active;
  if (!active) {
    clearAll();
    vscode.window.setStatusBarMessage('ImpactFlow: focus mode off.', 1500);
    return;
  }
  refreshAll();
  vscode.window.setStatusBarMessage('ImpactFlow: focus mode on — unrelated lines dimmed.', 2500);
}

function refreshAll(): void {
  for (const editor of vscode.window.visibleTextEditors) refreshEditor(editor);
}

function refreshEditor(editor: vscode.TextEditor): void {
  const deco = ensureDecoration();
  const file = lastSnapshot?.files.find((f) => f.path === editor.document.uri.fsPath);
  if (!file) {
    editor.setDecorations(deco, []);
    return;
  }
  // Build the set of "interesting" 1-based line ranges from modified + added fns.
  const interesting = new Set<number>();
  for (const fn of [...file.modified, ...file.added]) {
    interesting.add(fn.line);
    // Also keep the surrounding ±10 lines un-dimmed so context is visible.
    for (let k = 1; k <= 10; k++) {
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
}

function clearAll(): void {
  if (!dimType) return;
  for (const editor of vscode.window.visibleTextEditors) editor.setDecorations(dimType, []);
}

export function disposeFocusMode(): void {
  dimType?.dispose();
  dimType = undefined;
  active = false;
}
