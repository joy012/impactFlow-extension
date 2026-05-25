/**
 * F13 — Refactor-safety helper.
 * When a signature diff is detected and only the function name changed,
 * offer a guided rename through VS Code's built-in rename provider.
 */

import * as vscode from 'vscode';
import { logger } from './logger.js';
import type { FnSummary } from './shared/messages.js';

/**
 * Heuristic: signature diff exists, and its description mentions only the name
 * (no param / return-type change). Returns the candidate or undefined.
 */
export function detectRenameCandidate(
  fnBeforeName: string,
  fnAfterName: string,
  fn: FnSummary,
): { from: string; to: string } | undefined {
  if (fnBeforeName === fnAfterName) return undefined;
  const sig = fn.diffs?.find((d) => d.type === 'signature');
  if (!sig) return undefined;
  // Only offer when the signature diff is *just* the name (no param/return diff).
  const hasOtherSignature = /parameters changed|return type changed/.test(sig.description);
  if (hasOtherSignature) return undefined;
  return { from: fnBeforeName, to: fnAfterName };
}

export async function runGuidedRename(
  filePath: string,
  line: number,
  newName: string,
): Promise<void> {
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const lineText = doc.lineAt(Math.max(0, line - 1)).text;
    const col = lineText.search(/[A-Za-z_]\w*/);
    if (col < 0) {
      vscode.window.showWarningMessage('ImpactFlow: could not locate the symbol to rename.');
      return;
    }
    const pos = new vscode.Position(line - 1, col);
    const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit | undefined>(
      'vscode.executeDocumentRenameProvider',
      doc.uri,
      pos,
      newName,
    );
    if (!edit) {
      vscode.window.showWarningMessage(
        "ImpactFlow: language server returned no rename plan — try VS Code's Rename Symbol (F2) manually.",
      );
      return;
    }
    const applied = await vscode.workspace.applyEdit(edit);
    if (applied) {
      vscode.window.showInformationMessage(`ImpactFlow: renamed to ${newName}.`);
    } else {
      vscode.window.showWarningMessage('ImpactFlow: rename was rejected.');
    }
  } catch (err) {
    logger.error('refactor-safety rename failed', err);
    vscode.window.showErrorMessage(`ImpactFlow: rename failed (${(err as Error).message}).`);
  }
}
