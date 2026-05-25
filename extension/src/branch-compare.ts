/**
 * F8 — Branch-vs-branch diff view.
 * Lets the user compare any two refs and renders the behavior-diff report.
 */

import { relative } from 'node:path';
import { type SimpleGit, simpleGit } from 'simple-git';
import * as vscode from 'vscode';
import { diffBehavior } from './behavior-diff/index.js';
import { findReferences } from './impact/references.js';
import { logger } from './logger.js';
import { buildFunctionTable, languageFor } from './parsers/router.js';
import { diffFunctionTables, emptyTable } from './parsers/typescript/diff-functions.js';
import { computeRisk } from './risk/formula.js';

export async function runBranchCompare(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage('ImpactFlow: open a folder first.');
    return;
  }
  const root = folder.uri.fsPath;
  const git = simpleGit(root);

  let refs: string[];
  try {
    const branches = await git.branch(['--list', '--all']);
    const tags = await git.tags();
    refs = [...branches.all, ...tags.all].filter(Boolean);
    if (refs.length === 0) {
      vscode.window.showWarningMessage('ImpactFlow: no git refs found.');
      return;
    }
  } catch (err) {
    vscode.window.showErrorMessage(`ImpactFlow: git not available (${(err as Error).message}).`);
    return;
  }

  const sourceRef = await vscode.window.showQuickPick(['HEAD', ...refs], {
    title: 'ImpactFlow — compare branches (1/2): source ref',
    placeHolder: 'Pick the ref containing the new changes (default: HEAD)',
  });
  if (!sourceRef) return;

  const targetRef = await vscode.window.showQuickPick(
    refs.filter((r) => r !== sourceRef),
    {
      title: 'ImpactFlow — compare branches (2/2): target ref',
      placeHolder: 'Pick the ref to compare against (typically main)',
    },
  );
  if (!targetRef) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `ImpactFlow: ${sourceRef} → ${targetRef}…`,
      cancellable: true,
    },
    async (_p, token) => {
      try {
        const md = await compareRefs(git, root, sourceRef, targetRef, token);
        if (token.isCancellationRequested) return;
        const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: md });
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch (err) {
        logger.error('branch compare failed', err);
        vscode.window.showErrorMessage(
          `ImpactFlow: branch comparison failed (${(err as Error).message}).`,
        );
      }
    },
  );
}

async function compareRefs(
  git: SimpleGit,
  root: string,
  sourceRef: string,
  targetRef: string,
  token: vscode.CancellationToken,
): Promise<string> {
  let mergeBase: string;
  try {
    mergeBase = (await git.raw(['merge-base', sourceRef, targetRef])).trim();
  } catch {
    mergeBase = targetRef;
  }

  const files = (await git.diff([`${mergeBase}...${sourceRef}`, '--name-only']))
    .split('\n')
    .map((s) => s.trim())
    .filter((p) => p && languageFor(p) !== null);

  if (files.length === 0) {
    return [
      '# ImpactFlow — Branch Compare',
      '',
      `**${sourceRef}** vs **${targetRef}**`,
      '',
      '_No behavior-relevant files changed between these refs._',
    ].join('\n');
  }

  const sections: string[] = [];
  const counts = { safe: 0, low: 0, medium: 0, high: 0 };
  let totalDiffs = 0;

  for (const rel of files) {
    if (token.isCancellationRequested) break;
    const abs = `${root}/${rel}`;
    const baselineText = await safeShow(git, mergeBase, rel);
    const currentText = await safeShow(git, sourceRef, rel);
    if (currentText === null) continue;
    const before = baselineText ? buildFunctionTable(abs, baselineText) : emptyTable(abs);
    const after = buildFunctionTable(abs, currentText);
    const td = diffFunctionTables(before, after);

    const lines: string[] = [];
    for (const { before: b, after: a } of td.modified) {
      const bd = diffBehavior(b, a);
      if (bd.pureRenameOrFormatting || bd.diffs.length === 0) continue;
      const top = pickTop(bd.diffs.map((d) => d.severity));
      const refs = await findReferences(abs, a.name, a.startLine);
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
      for (const d of bd.diffs.slice(0, 4)) lines.push(`    - _${d.type}_: ${d.description}`);
    }
    for (const a of td.added) {
      lines.push(`- + **${a.name}** (added${a.isExported ? ', exported' : ''})`);
    }
    for (const r of td.removed) lines.push(`- − **${r.name}** (removed)`);
    if (lines.length) sections.push(`### \`${shortenPath(rel, root)}\`\n\n${lines.join('\n')}`);
  }

  if (sections.length === 0) {
    return [
      '# ImpactFlow — Branch Compare',
      '',
      `**${sourceRef}** vs **${targetRef}**`,
      '',
      '_No behavioral changes detected._',
    ].join('\n');
  }

  const header = [
    '# ImpactFlow — Branch Compare',
    '',
    `**${sourceRef}** vs **${targetRef}** (merge-base \`${mergeBase.slice(0, 7)}\`)`,
    '',
    `Files: **${files.length}** · Behavior changes: **${totalDiffs}**`,
    '',
    `Risk: ${counts.high} HIGH · ${counts.medium} MEDIUM · ${counts.low} LOW · ${counts.safe} SAFE`,
    '',
    '---',
    '',
  ].join('\n');
  return header + sections.join('\n\n');
}

async function safeShow(git: SimpleGit, ref: string, relPath: string): Promise<string | null> {
  try {
    return await git.show([`${ref}:${relPath.replaceAll('\\', '/')}`]);
  } catch {
    return null;
  }
}

function shortenPath(absOrRel: string, root: string): string {
  return absOrRel.startsWith(root) ? relative(root, absOrRel) : absOrRel;
}

function pickTop(
  severities: Array<'safe' | 'low' | 'medium' | 'high'>,
): 'safe' | 'low' | 'medium' | 'high' {
  if (severities.includes('high')) return 'high';
  if (severities.includes('medium')) return 'medium';
  if (severities.includes('low')) return 'low';
  return 'safe';
}
