import * as vscode from 'vscode';
import { collectChanges } from './change-detection/change-collector.js';
import { logger } from './logger.js';

export const generateCommitSummary = async (): Promise<string> => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return '_No workspace open._';

  const root = folder.uri.fsPath;
  const batch = await collectChanges(root);
  if (batch.files.length === 0) return '_No tracked changes since branch base._';

  const counts = { safe: 0, low: 0, medium: 0, high: 0 };
  const byFile = new Map<string, string[]>();

  for (const c of batch.changes) {
    counts[c.risk.level]++;
    const lines = byFile.get(c.filePath) ?? [];
    lines.push(`- **${c.name}** — \`${c.risk.level.toUpperCase()}\` (${c.callerCount} callers)`);
    for (const d of c.diffs) lines.push(`    - _${d.type}_: ${d.description}`);
    byFile.set(c.filePath, lines);
  }
  for (const a of batch.added) {
    const lines = byFile.get(a.filePath) ?? [];
    lines.push(`- + **${a.name}** (added${a.isExported ? ', exported' : ''})`);
    byFile.set(a.filePath, lines);
  }
  for (const r of batch.removed) {
    const lines = byFile.get(r.filePath) ?? [];
    lines.push(`- − **${r.name}** (removed)`);
    byFile.set(r.filePath, lines);
  }

  if (byFile.size === 0) return '_No behavior changes detected._';

  const sections: string[] = [];
  for (const [filePath, lines] of byFile) {
    sections.push(`### \`${shortenPath(filePath, root)}\`\n\n${lines.join('\n')}`);
  }

  const totalDiffs = batch.changes.length;
  const header = [
    '# ImpactFlow — Commit Summary',
    '',
    `Files analyzed: **${batch.files.length}** · Behavior changes: **${totalDiffs}**`,
    '',
    `Risk: ${counts.high} HIGH · ${counts.medium} MEDIUM · ${counts.low} LOW · ${counts.safe} SAFE`,
    '',
    '---',
    '',
  ].join('\n');

  logger.info(`Commit summary generated: ${totalDiffs} diffs across ${sections.length} files.`);
  return header + sections.join('\n\n');
};

const shortenPath = (abs: string, root: string): string =>
  abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
