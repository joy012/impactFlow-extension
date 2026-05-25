/**
 * F9 / E1a — Dead-code finder (read-only report).
 * Walks workspace symbols via the language server and reports zero-caller exports.
 *
 * Safety: this build only REPORTS dead code. Automated removal (E1b) is gated on
 * the safety rules in docs/ROADMAP.md §E1 and is implemented in a later phase.
 */

import * as vscode from 'vscode';
import { logger } from '../logger.js';
import { languageFor } from '../parsers/router.js';

export interface DeadCodeFinding {
  filePath: string;
  symbol: string;
  line: number;
  kind: string;
  /** True if user-confirmed-safe via E1 safety rules (always false in v1 read-only). */
  safeToRemove: boolean;
  reason: string;
}

export interface DeadCodeReport {
  generatedAt: number;
  durationMs: number;
  scanned: number;
  findings: DeadCodeFinding[];
  /** Files we couldn't reliably scan (no LSP, parse failed, etc.). */
  skipped: Array<{ filePath: string; reason: string }>;
}

const TEST_PATH_RE =
  /\.(test|spec)\.[cm]?[jt]sx?$|[\\/](__tests__|tests?|spec|e2e)[\\/]|\/_test\.go$|\/test_[^/]+\.py$|\/[^/]+_test\.py$/;

const TIMEOUT_MS = 60_000;

export async function scanDeadCode(token?: vscode.CancellationToken): Promise<DeadCodeReport> {
  const t0 = Date.now();
  const findings: DeadCodeFinding[] = [];
  const skipped: DeadCodeReport['skipped'] = [];
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    return { generatedAt: Date.now(), durationMs: 0, scanned: 0, findings, skipped };
  }

  const includeGlob = `{${[
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.jsx',
    '**/*.mjs',
    '**/*.cjs',
    '**/*.py',
    '**/*.go',
    '**/*.dart',
  ].join(',')}}`;
  const excludeGlob = '{**/node_modules/**,**/dist/**,**/out/**,**/build/**,**/.git/**}';

  const allFiles = await vscode.workspace.findFiles(includeGlob, excludeGlob, 2000);
  const sourceFiles = allFiles.filter((f) => !TEST_PATH_RE.test(f.fsPath));
  let scanned = 0;

  // Hard timeout — we never block the user for more than 60 s.
  const deadline = Date.now() + TIMEOUT_MS;

  for (const uri of sourceFiles) {
    if (token?.isCancellationRequested) break;
    if (Date.now() > deadline) {
      skipped.push({
        filePath: '<scan>',
        reason: 'timeout — increase impactflow.cleanup.timeoutSec',
      });
      break;
    }
    if (!languageFor(uri.fsPath)) {
      skipped.push({ filePath: uri.fsPath, reason: 'unsupported language' });
      continue;
    }
    scanned++;

    let symbols: vscode.DocumentSymbol[] | undefined;
    try {
      symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri,
      );
    } catch (err) {
      skipped.push({
        filePath: uri.fsPath,
        reason: `symbol query failed: ${(err as Error).message}`,
      });
      continue;
    }
    if (!symbols || symbols.length === 0) {
      skipped.push({ filePath: uri.fsPath, reason: 'no symbols returned by language server' });
      continue;
    }

    const candidates = collectCandidates(symbols);
    for (const sym of candidates) {
      if (token?.isCancellationRequested) break;
      const refs = await safeRefs(uri, sym.selectionRange.start);
      // Filter out references in the declaration file itself + test files.
      const externalRefs = refs.filter(
        (r) =>
          !(r.uri.fsPath === uri.fsPath && r.range.start.line === sym.selectionRange.start.line) &&
          !TEST_PATH_RE.test(r.uri.fsPath),
      );
      if (externalRefs.length === 0) {
        findings.push({
          filePath: uri.fsPath,
          symbol: sym.name,
          line: sym.selectionRange.start.line + 1,
          kind: vscode.SymbolKind[sym.kind],
          safeToRemove: false,
          reason: 'no non-test callers in workspace (review before removing)',
        });
      }
    }
  }

  return {
    generatedAt: Date.now(),
    durationMs: Date.now() - t0,
    scanned,
    findings,
    skipped,
  };
}

/** Flatten nested DocumentSymbols, keeping only function-like exports. */
function collectCandidates(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
  const out: vscode.DocumentSymbol[] = [];
  const stack = [...symbols];
  while (stack.length > 0) {
    const s = stack.pop()!;
    const fnish =
      s.kind === vscode.SymbolKind.Function ||
      s.kind === vscode.SymbolKind.Method ||
      s.kind === vscode.SymbolKind.Constructor;
    // Heuristic: ignore underscore-prefixed (private convention)
    if (fnish && !s.name.startsWith('_')) out.push(s);
    if (s.children?.length) stack.push(...s.children);
  }
  return out;
}

async function safeRefs(uri: vscode.Uri, pos: vscode.Position): Promise<vscode.Location[]> {
  try {
    const r = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      uri,
      pos,
    );
    return r ?? [];
  } catch (err) {
    logger.debug(`reference query failed: ${(err as Error).message}`);
    return [];
  }
}
