/**
 * Impact propagation — find references to a changed function using the
 * VS Code language service. Avoids re-implementing a workspace AST graph.
 */

import * as vscode from 'vscode';
import { logger } from '../logger.js';

export interface ImpactedRef {
  filePath: string;
  line: number;
  /** True if reference is in the same file as the changed function. */
  sameFile: boolean;
}

/**
 * Find call sites referencing the named function declared at `startLine` in `filePath`.
 * Uses VS Code's reference provider — no separate ts-morph project needed.
 */
export async function findReferences(
  filePath: string,
  fnName: string,
  startLine: number,
): Promise<ImpactedRef[]> {
  try {
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    // Strip the leading prefix (e.g. "ClassA.foo" → "foo").
    const bareName = fnName.split('.').pop() ?? fnName;
    const lineIdx = Math.max(0, startLine - 1);
    if (lineIdx >= doc.lineCount) return [];
    const lineText = doc.lineAt(lineIdx).text;
    const col = lineText.indexOf(bareName);
    if (col < 0) return [];
    const pos = new vscode.Position(lineIdx, col);

    const locs =
      (await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        uri,
        pos,
      )) ?? [];

    const refs: ImpactedRef[] = [];
    for (const loc of locs) {
      // Skip the declaration itself.
      if (loc.uri.fsPath === filePath && loc.range.start.line === lineIdx) continue;
      refs.push({
        filePath: loc.uri.fsPath,
        line: loc.range.start.line + 1,
        sameFile: loc.uri.fsPath === filePath,
      });
    }
    return refs;
  } catch (err) {
    logger.debug(`findReferences failed for ${fnName} @ ${filePath}: ${(err as Error).message}`);
    return [];
  }
}
