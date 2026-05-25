import * as vscode from 'vscode';
import { logger } from '../logger.js';
import { languageFor } from '../parsers/router.js';

export interface DeadCodeFinding {
  filePath: string;
  symbol: string;
  line: number;
  kind: string;
  safeToRemove: boolean;
  reason: string;
}

export interface DeadCodeReport {
  generatedAt: number;
  durationMs: number;
  scanned: number;
  findings: DeadCodeFinding[];
  skipped: Array<{ filePath: string; reason: string }>;
}

const TEST_PATH_RE =
  /\.(test|spec)\.[cm]?[jt]sx?$|[\\/](__tests__|tests?|spec|e2e)[\\/]|\/_test\.go$|\/test_[^/]+\.py$|\/[^/]+_test\.py$/;

const TIMEOUT_MS = 60_000;
// G2 — per-file budget so a slow LSP can't starve the rest of the scan.
const PER_FILE_TIMEOUT_MS = 5_000;

const INCLUDE_GLOB = `{${[
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
const EXCLUDE_GLOB = '{**/node_modules/**,**/dist/**,**/out/**,**/build/**,**/.git/**}';

export const scanDeadCode = async (token?: vscode.CancellationToken): Promise<DeadCodeReport> => {
  const t0 = Date.now();
  const findings: DeadCodeFinding[] = [];
  const skipped: DeadCodeReport['skipped'] = [];
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    return { generatedAt: Date.now(), durationMs: 0, scanned: 0, findings, skipped };
  }

  const allFiles = await vscode.workspace.findFiles(INCLUDE_GLOB, EXCLUDE_GLOB, 2000);
  const sourceFiles = allFiles.filter((f) => !TEST_PATH_RE.test(f.fsPath));
  let scanned = 0;
  const deadline = Date.now() + TIMEOUT_MS;

  for (const uri of sourceFiles) {
    if (token?.isCancellationRequested) break;
    if (Date.now() > deadline) {
      skipped.push({ filePath: '<scan>', reason: 'timeout — workspace too large for one pass' });
      break;
    }
    if (!languageFor(uri.fsPath)) {
      skipped.push({ filePath: uri.fsPath, reason: 'unsupported language' });
      continue;
    }
    scanned++;

    const symbols = await withTimeout(
      () =>
        vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
          'vscode.executeDocumentSymbolProvider',
          uri,
        ),
      PER_FILE_TIMEOUT_MS,
    );
    if (!symbols) {
      skipped.push({ filePath: uri.fsPath, reason: 'symbol query timed out or failed' });
      continue;
    }
    if (symbols.length === 0) {
      skipped.push({ filePath: uri.fsPath, reason: 'no symbols returned by language server' });
      continue;
    }

    for (const sym of collectCandidates(symbols)) {
      if (token?.isCancellationRequested) break;
      const refs = await withTimeout(
        () => safeRefs(uri, sym.selectionRange.start),
        PER_FILE_TIMEOUT_MS,
      );
      if (!refs) continue;
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

  return { generatedAt: Date.now(), durationMs: Date.now() - t0, scanned, findings, skipped };
};

const collectCandidates = (symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] => {
  const out: vscode.DocumentSymbol[] = [];
  const stack = [...symbols];
  while (stack.length > 0) {
    const s = stack.pop()!;
    const fnish =
      s.kind === vscode.SymbolKind.Function ||
      s.kind === vscode.SymbolKind.Method ||
      s.kind === vscode.SymbolKind.Constructor;
    if (fnish && !s.name.startsWith('_')) out.push(s);
    if (s.children?.length) stack.push(...s.children);
  }
  return out;
};

const safeRefs = async (uri: vscode.Uri, pos: vscode.Position): Promise<vscode.Location[]> => {
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
};

const withTimeout = async <T>(
  fn: () => Thenable<T> | Promise<T>,
  ms: number,
): Promise<T | null> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race<T | null>([
      Promise.resolve(fn()),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
};
