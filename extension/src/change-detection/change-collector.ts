import { promises as fs } from 'node:fs';
import * as vscode from 'vscode';
import { type BehaviorDiff, type Severity, diffBehavior } from '../behavior-diff/index.js';
import { findReferences } from '../impact/references.js';
import { buildFunctionTable, languageFor } from '../parsers/router.js';
import { diffFunctionTables, emptyTable } from '../parsers/typescript/diff-functions.js';
import { type RiskOutput, computeRisk } from '../risk/formula.js';
import { BranchBaseBaseline } from './baseline.js';

export interface AddedRemoved {
  filePath: string;
  name: string;
  isExported?: boolean;
}

export interface BehaviorChange {
  filePath: string;
  name: string;
  diffs: BehaviorDiff[];
  topSeverity: Severity;
  risk: RiskOutput;
  callerCount: number;
}

export interface ChangeBatch {
  files: string[];
  changes: BehaviorChange[];
  added: AddedRemoved[];
  removed: AddedRemoved[];
}

export const collectChanges = async (workspaceRoot: string): Promise<ChangeBatch> => {
  const baseline = new BranchBaseBaseline(workspaceRoot);
  const files = await baseline.changedFiles();
  const changes: BehaviorChange[] = [];
  const added: AddedRemoved[] = [];
  const removed: AddedRemoved[] = [];

  for (const filePath of files) {
    if (!languageFor(filePath)) continue;
    const currentText = await readText(filePath);
    if (currentText === null) continue;
    const baselineText = await baseline.getFile(filePath);

    const before = baselineText ? buildFunctionTable(filePath, baselineText) : emptyTable(filePath);
    const after = buildFunctionTable(filePath, currentText);
    const td = diffFunctionTables(before, after);

    for (const a of td.added) added.push({ filePath, name: a.name, isExported: a.isExported });
    for (const r of td.removed) removed.push({ filePath, name: r.name });

    for (const { before: b, after: a } of td.modified) {
      const bd = diffBehavior(b, a);
      if (bd.pureRenameOrFormatting || bd.diffs.length === 0) continue;
      const top = pickTopSeverity(bd.diffs.map((d) => d.severity));
      const refs = await findReferences(filePath, a.name, a.startLine);
      const risk = computeRisk({
        topSeverity: top,
        isPublicSurface: a.isExported,
        impactedCount: refs.length,
        crossesPackageBoundary: false,
        touchesAsyncBoundary: bd.diffs.some((d) => d.type === 'asyncness'),
      });
      changes.push({
        filePath,
        name: a.name,
        diffs: bd.diffs,
        topSeverity: top,
        risk,
        callerCount: refs.length,
      });
    }
  }

  return { files, changes, added, removed };
};

export const pickTopSeverity = (severities: Severity[]): Severity => {
  if (severities.includes('high')) return 'high';
  if (severities.includes('medium')) return 'medium';
  if (severities.includes('low')) return 'low';
  return 'safe';
};

const readText = async (filePath: string): Promise<string | null> => {
  // Prefer the in-memory document so we see unsaved edits.
  const open = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === filePath);
  if (open) return open.getText();
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
};
