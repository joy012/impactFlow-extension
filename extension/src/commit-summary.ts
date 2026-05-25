/**
 * Commit-time summary command. Computes a behavior-diff against the merge-base
 * with main/master/trunk and renders a Markdown report.
 */

import * as vscode from 'vscode';
import { diffBehavior } from './behavior-diff/index.js';
import { BranchBaseBaseline } from './change-detection/baseline.js';
import { findReferences } from './impact/references.js';
import { logger } from './logger.js';
import { diffFunctionTables, emptyTable } from './parsers/typescript/diff-functions.js';
import { buildFunctionTable } from './parsers/typescript/function-table.js';
import { computeRisk } from './risk/formula.js';

export async function generateCommitSummary(): Promise<string> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return '_No workspace open._';

  const baseline = new BranchBaseBaseline(folder.uri.fsPath);
  const files = await baseline.changedFiles();
  if (files.length === 0) return '_No tracked changes since branch base._';

  const sections: string[] = [];
  let totalDiffs = 0;
  const counts = { safe: 0, low: 0, medium: 0, high: 0 };

  for (const filePath of files) {
    if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) continue;
    let currentText: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
      currentText = Buffer.from(bytes).toString('utf8');
    } catch {
      continue;
    }
    const baselineText = await baseline.getFile(filePath);
    const before = baselineText ? buildFunctionTable(filePath, baselineText) : emptyTable(filePath);
    const after = buildFunctionTable(filePath, currentText);
    const tableDiff = diffFunctionTables(before, after);

    const lines: string[] = [];
    for (const { before: b, after: a } of tableDiff.modified) {
      const bd = diffBehavior(b, a);
      if (bd.pureRenameOrFormatting || bd.diffs.length === 0) continue;
      const top = pickTop(bd.diffs.map((d) => d.severity));
      const refs = await findReferences(filePath, a.name, a.startLine);
      const risk = computeRisk({
        topSeverity: top,
        isPublicSurface: a.isExported,
        impactedCount: refs.length,
        crossesPackageBoundary: false,
        touchesAsyncBoundary: bd.diffs.some((d) => d.type === 'asyncness'),
      });
      counts[risk.level]++;
      totalDiffs++;
      lines.push(`- **${a.name}** — \`${risk.level.toUpperCase()}\` (${refs.length} callers)`);
      for (const d of bd.diffs) {
        lines.push(`    - _${d.type}_: ${d.description}`);
      }
    }
    if (tableDiff.added.length) {
      for (const a of tableDiff.added)
        lines.push(`- + **${a.name}** (added${a.isExported ? ', exported' : ''})`);
    }
    if (tableDiff.removed.length) {
      for (const r of tableDiff.removed) lines.push(`- − **${r.name}** (removed)`);
    }
    if (lines.length > 0) {
      sections.push(`### \`${shorten(filePath, folder.uri.fsPath)}\`\n\n${lines.join('\n')}`);
    }
  }

  if (sections.length === 0) return '_No behavior changes detected._';

  const header = [
    '# ImpactFlow — Commit Summary',
    '',
    `Files analyzed: **${files.length}** · Behavior changes: **${totalDiffs}**`,
    '',
    `Risk: ${counts.high} HIGH · ${counts.medium} MEDIUM · ${counts.low} LOW · ${counts.safe} SAFE`,
    '',
    '---',
    '',
  ].join('\n');

  logger.info(`Commit summary generated: ${totalDiffs} diffs across ${sections.length} files.`);
  return header + sections.join('\n\n');
}

function pickTop(
  severities: Array<'safe' | 'low' | 'medium' | 'high'>,
): 'safe' | 'low' | 'medium' | 'high' {
  if (severities.includes('high')) return 'high';
  if (severities.includes('medium')) return 'medium';
  if (severities.includes('low')) return 'low';
  return 'safe';
}

function shorten(abs: string, root: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}
