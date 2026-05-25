import { relative } from 'node:path';
import { type SimpleGit, simpleGit } from 'simple-git';
import * as vscode from 'vscode';
import { diffBehavior } from './behavior-diff/index.js';
import { findReferences } from './impact/references.js';
import { logger } from './logger.js';
import { buildFunctionTable, languageFor } from './parsers/router.js';
import { diffFunctionTables, emptyTable } from './parsers/typescript/diff-functions.js';
import { computeRisk } from './risk/formula.js';

type Severity = 'safe' | 'low' | 'medium' | 'high';

export const runBranchCompare = async (): Promise<void> => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage('ImpactFlow: open a folder first.');
    return;
  }
  const root = folder.uri.fsPath;
  const git = simpleGit(root);

  const refs = await listRefs(git);
  if (!refs) return;

  const sourceRef = await pickRef(['HEAD', ...refs], 1, 'source ref containing new changes');
  if (!sourceRef) return;
  const targetRef = await pickRef(
    refs.filter((r) => r !== sourceRef),
    2,
    'target ref (typically main)',
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
};

const listRefs = async (git: SimpleGit): Promise<string[] | null> => {
  try {
    const branches = await git.branch(['--list', '--all']);
    const tags = await git.tags();
    // Pin HEAD + the current branch at the top so the picker default is sensible (N5 audit nudge).
    const current = branches.current ?? 'HEAD';
    const ordered = [current, ...branches.all.filter((b) => b !== current), ...tags.all].filter(
      (b, i, arr) => Boolean(b) && arr.indexOf(b) === i,
    );
    if (ordered.length === 0) {
      vscode.window.showWarningMessage('ImpactFlow: no git refs found.');
      return null;
    }
    return ordered;
  } catch (err) {
    vscode.window.showErrorMessage(`ImpactFlow: git not available (${(err as Error).message}).`);
    return null;
  }
};

const pickRef = (refs: string[], step: 1 | 2, hint: string): Thenable<string | undefined> =>
  vscode.window.showQuickPick(refs, {
    title: `ImpactFlow — compare branches (${step}/2): ${hint}`,
    placeHolder: refs[0],
  });

const compareRefs = async (
  git: SimpleGit,
  root: string,
  sourceRef: string,
  targetRef: string,
  token: vscode.CancellationToken,
): Promise<string> => {
  // B7 — detect disconnected histories rather than silently falling back.
  let mergeBase: string;
  try {
    mergeBase = (await git.raw(['merge-base', sourceRef, targetRef])).trim();
    if (!mergeBase) throw new Error('empty merge-base');
  } catch {
    return [
      '# ImpactFlow — Branch Compare',
      '',
      `**${sourceRef}** vs **${targetRef}**`,
      '',
      '> ⚠ **Histories are unrelated.** `git merge-base` returned no common ancestor.',
      "> ImpactFlow can't compute a behavior diff across disconnected histories.",
      '',
      'Likely causes:',
      '- Different repos accidentally merged into one workspace',
      "- A shallow clone that doesn't include the common ancestor (`git fetch --unshallow` may fix it)",
      '- One side is an orphan branch created with `git checkout --orphan`',
    ].join('\n');
  }

  const files = (await git.diff([`${mergeBase}...${sourceRef}`, '--name-only']))
    .split('\n')
    .map((s) => s.trim())
    .filter((p) => p && languageFor(p) !== null);

  if (files.length === 0) {
    return renderHeader(
      sourceRef,
      targetRef,
      mergeBase,
      '_No behavior-relevant files changed between these refs._',
    );
  }

  const counts: Record<Severity, number> = { safe: 0, low: 0, medium: 0, high: 0 };
  let totalDiffs = 0;
  const sections: string[] = [];

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
    return renderHeader(sourceRef, targetRef, mergeBase, '_No behavioral changes detected._');
  }

  const summary = [
    `Files: **${files.length}** · Behavior changes: **${totalDiffs}**`,
    '',
    `Risk: ${counts.high} HIGH · ${counts.medium} MEDIUM · ${counts.low} LOW · ${counts.safe} SAFE`,
  ].join('\n');
  return `${renderHeader(sourceRef, targetRef, mergeBase, summary)}\n\n${sections.join('\n\n')}`;
};

const renderHeader = (source: string, target: string, mergeBase: string, body: string): string =>
  [
    '# ImpactFlow — Branch Compare',
    '',
    `**${source}** vs **${target}** (merge-base \`${mergeBase.slice(0, 7)}\`)`,
    '',
    body,
    '',
    '---',
  ].join('\n');

const safeShow = async (git: SimpleGit, ref: string, relPath: string): Promise<string | null> => {
  try {
    return await git.show([`${ref}:${relPath.replaceAll('\\', '/')}`]);
  } catch {
    return null;
  }
};

const shortenPath = (absOrRel: string, root: string): string =>
  absOrRel.startsWith(root) ? relative(root, absOrRel) : absOrRel;

const pickTop = (severities: Severity[]): Severity => {
  if (severities.includes('high')) return 'high';
  if (severities.includes('medium')) return 'medium';
  if (severities.includes('low')) return 'low';
  return 'safe';
};
