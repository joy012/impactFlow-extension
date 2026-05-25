/**
 * E1b — Dead-code preview + apply (safety-gated).
 *
 * Safety rules — every one must hold before we offer to apply:
 *  1. Workspace is a git repo (so the user can `git checkout .` to bail).
 *  2. Git working tree is clean (configurable: `impactflow.cleanup.requireGitClean`).
 *  3. Candidate file is NOT in `impactflow.cleanup.preserveGlob`.
 *  4. Candidate file has no obvious dynamic-access patterns (eval/getattr/etc).
 *  5. User explicitly selects each candidate via multi-select Quick Pick.
 *  6. User confirms a final modal before any edit is applied.
 *  7. The deletion is one single `WorkspaceEdit` — fully undoable with cmd+z.
 */

import { promises as fs } from 'node:fs';
import { join, relative } from 'node:path';
import { simpleGit } from 'simple-git';
import * as vscode from 'vscode';
import { isGitRepo } from '../git-detect.js';
import { logger } from '../logger.js';
import { type DeadCodeFinding, scanDeadCode } from './scan.js';

const DEFAULT_PRESERVE_GLOB = [
  '**/index.*',
  '**/bin/**',
  '**/cli/**',
  '**/main.*',
  '**/cli.*',
  '**/pages/**',
  '**/app/**',
  '**/api/**',
  '**/routes/**',
  '**/*.gen.*',
  '**/*_pb.*',
  '**/generated/**',
];

// Patterns that indicate the file uses dynamic-access escape hatches; refs can lie.
const DYNAMIC_ACCESS_PATTERNS = [
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\bFunction\s*\(\s*['"`]/,
  /\brequire\s*\(\s*[^'"\s)]+\)/, // require(varName)
  /\bimport\s*\(\s*[^'"\s)]+\)/, // import(varName)
  /\bReflect\.[a-z]/,
  /\bgetattr\s*\(/,
  /\bsetattr\s*\(/,
  /\bObject\s*\[/,
];

export async function runDeadCodeCleanup(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage('ImpactFlow: open a folder first.');
    return;
  }
  const root = folder.uri.fsPath;

  // Rule 1: git repo
  if (!isGitRepo(root)) {
    vscode.window.showWarningMessage(
      'Dead-code cleanup requires a git repo so changes are recoverable. Run `git init` first.',
    );
    return;
  }

  // Rule 2: clean working tree (configurable)
  const cfg = vscode.workspace.getConfiguration('impactflow.cleanup');
  const requireClean = cfg.get<boolean>('requireGitClean', true);
  if (requireClean) {
    try {
      const git = simpleGit(root);
      const status = await git.status();
      if (!status.isClean()) {
        vscode.window.showWarningMessage(
          'Dead-code cleanup refuses to run on a dirty working tree. Stash or commit first, or set `impactflow.cleanup.requireGitClean` to false to override.',
        );
        return;
      }
    } catch (err) {
      vscode.window.showWarningMessage(
        `Could not verify git status (${(err as Error).message}). Aborting for safety.`,
      );
      return;
    }
  }

  // Run the scan
  const report = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'ImpactFlow: scanning for dead code…',
      cancellable: true,
    },
    async (_p, token) => scanDeadCode(token),
  );

  if (report.findings.length === 0) {
    vscode.window.showInformationMessage(
      `ImpactFlow: no dead-code candidates across ${report.scanned} files.`,
    );
    return;
  }

  // Filter by safety rules 3 + 4 before showing the picker
  const safe: DeadCodeFinding[] = [];
  const unsafe: Array<{ finding: DeadCodeFinding; reason: string }> = [];
  const preserveGlob = cfg.get<string[]>('preserveGlob', DEFAULT_PRESERVE_GLOB);

  for (const f of report.findings) {
    const rel = relative(root, f.filePath).replaceAll('\\', '/');
    if (matchesAnyGlob(rel, preserveGlob)) {
      unsafe.push({ finding: f, reason: 'matches preserveGlob' });
      continue;
    }
    let text = '';
    try {
      text = await fs.readFile(f.filePath, 'utf8');
    } catch {
      unsafe.push({ finding: f, reason: 'could not read file' });
      continue;
    }
    if (DYNAMIC_ACCESS_PATTERNS.some((p) => p.test(text))) {
      unsafe.push({ finding: f, reason: 'file uses dynamic access — refs may lie' });
      continue;
    }
    safe.push(f);
  }

  if (safe.length === 0) {
    const reasons = unsafe
      .slice(0, 5)
      .map((u) => `· ${u.finding.symbol}: ${u.reason}`)
      .join('\n');
    vscode.window.showInformationMessage(
      `ImpactFlow: ${report.findings.length} candidates found, none safe to auto-remove.\n${reasons}`,
    );
    return;
  }

  // Rule 5: multi-select Quick Pick
  const picks = await vscode.window.showQuickPick(
    safe.map((f) => ({
      label: `$(trash) ${f.symbol}`,
      description: relative(root, f.filePath),
      detail: `Line ${f.line} · ${f.reason}`,
      finding: f,
      picked: false,
    })),
    {
      title: `ImpactFlow — select dead code to remove (${safe.length} safe candidates, ${unsafe.length} skipped)`,
      placeHolder: 'Space to toggle · Enter to continue',
      canPickMany: true,
    },
  );

  if (!picks || picks.length === 0) return;

  // Rule 6: final modal confirmation
  const confirm = await vscode.window.showWarningMessage(
    `Delete ${picks.length} dead function${picks.length === 1 ? '' : 's'}? This change is a single edit and can be undone with cmd+z.`,
    { modal: true },
    'Apply',
  );
  if (confirm !== 'Apply') return;

  // Rule 7: one WorkspaceEdit
  const edit = new vscode.WorkspaceEdit();
  for (const pick of picks) {
    const uri = vscode.Uri.file(pick.finding.filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const range = await deletionRangeFor(doc, pick.finding);
    if (!range) continue;
    edit.delete(uri, range);
  }
  const ok = await vscode.workspace.applyEdit(edit);
  if (ok) {
    vscode.window.showInformationMessage(
      `ImpactFlow: removed ${picks.length} item${picks.length === 1 ? '' : 's'}. Press cmd+z to undo.`,
    );
    logger.info(`dead-code removed: ${picks.map((p) => p.finding.symbol).join(', ')}`);
  } else {
    vscode.window.showWarningMessage('ImpactFlow: edit was rejected. No files modified.');
  }
}

async function deletionRangeFor(
  doc: vscode.TextDocument,
  finding: DeadCodeFinding,
): Promise<vscode.Range | null> {
  // Use the document-symbol API to get the precise span of the symbol.
  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      doc.uri,
    );
    const sym = findSymbolByName(symbols ?? [], finding.symbol, finding.line - 1);
    if (sym) return sym.range;
  } catch (err) {
    logger.debug(`deletionRangeFor symbol-lookup failed: ${(err as Error).message}`);
  }
  // Fallback: just the declaration line — leaves the body intact (safer than guessing).
  const lineIdx = Math.max(0, finding.line - 1);
  if (lineIdx >= doc.lineCount) return null;
  return doc.lineAt(lineIdx).rangeIncludingLineBreak;
}

function findSymbolByName(
  symbols: vscode.DocumentSymbol[],
  name: string,
  expectedLine: number,
): vscode.DocumentSymbol | undefined {
  const stack = [...symbols];
  while (stack.length > 0) {
    const s = stack.pop()!;
    if (s.name === name && Math.abs(s.selectionRange.start.line - expectedLine) <= 1) return s;
    if (s.children?.length) stack.push(...s.children);
  }
  return undefined;
}

function matchesAnyGlob(rel: string, patterns: string[]): boolean {
  return patterns.some((p) => globMatch(rel, p));
}

// Lightweight glob: only ** and * supported.
function globMatch(path: string, pattern: string): boolean {
  const re = new RegExp(
    `^${pattern
      .replaceAll('.', '\\.')
      .replaceAll('**/', '(?:.*/)?')
      .replaceAll('**', '.*')
      .replaceAll('*', '[^/]*')}$`,
  );
  return re.test(path);
}

// Avoid TS "unused" warnings while we keep these in the module.
void join;
