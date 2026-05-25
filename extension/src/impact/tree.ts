import { promises as fs } from 'node:fs';
import * as vscode from 'vscode';
import { logger } from '../logger.js';
import { buildFunctionTable, languageFor } from '../parsers/router.js';
import type { CallerNode } from './tree-render.js';

export { renderTreeMarkdown } from './tree-render.js';
export type { CallerNode } from './tree-render.js';

export interface CallerTreeOptions {
  filePath: string;
  fnName: string;
  startLine: number;
  /** Max recursion depth (root is depth 0). */
  maxDepth?: number;
  /** Soft cap on total nodes before we bail out with "tree too large". */
  maxNodes?: number;
  token?: vscode.CancellationToken;
}

const DEFAULT_DEPTH = 2;
const DEFAULT_MAX_NODES = 200;

export const buildCallerTree = async (opts: CallerTreeOptions): Promise<CallerNode> => {
  const maxDepth = opts.maxDepth ?? DEFAULT_DEPTH;
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
  const seen = new Set<string>();
  let counter = 0;

  const root: CallerNode = {
    filePath: opts.filePath,
    symbol: opts.fnName,
    line: opts.startLine,
    children: [],
  };
  seen.add(nodeKey(root));

  await expand(root, 0);
  return root;

  async function expand(node: CallerNode, depth: number): Promise<void> {
    if (depth >= maxDepth) {
      node.terminator = depth === 0 ? undefined : 'depth-cap';
      return;
    }
    if (counter >= maxNodes) {
      node.terminator = 'node-cap';
      return;
    }
    if (opts.token?.isCancellationRequested) {
      node.terminator = 'cancelled';
      return;
    }

    const callers = await findCallers(node.filePath, node.line, opts.token);
    for (const c of callers) {
      const key = `${c.filePath}::${c.symbol}::${c.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counter += 1;
      const child: CallerNode = {
        filePath: c.filePath,
        symbol: c.symbol,
        line: c.line,
        children: [],
      };
      node.children.push(child);
      if (counter >= maxNodes) break;
      await expand(child, depth + 1);
    }
  }
};

const findCallers = async (
  filePath: string,
  line: number,
  token?: vscode.CancellationToken,
): Promise<Array<{ filePath: string; symbol: string; line: number }>> => {
  try {
    const uri = vscode.Uri.file(filePath);
    const position = new vscode.Position(Math.max(0, line - 1), 0);
    const refs = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      uri,
      position,
    );
    if (!refs || token?.isCancellationRequested) return [];

    const out: Array<{ filePath: string; symbol: string; line: number }> = [];
    const byFile = new Map<string, vscode.Location[]>();
    for (const r of refs) {
      const list = byFile.get(r.uri.fsPath) ?? [];
      list.push(r);
      byFile.set(r.uri.fsPath, list);
    }

    for (const [otherFile, locs] of byFile) {
      if (otherFile === filePath) continue; // skip self-references
      if (!languageFor(otherFile)) continue;
      const symbol = await symbolEnclosingFirstRef(otherFile, locs[0]!.range.start.line);
      if (!symbol) continue;
      out.push({ filePath: otherFile, symbol: symbol.name, line: symbol.line });
    }
    return out;
  } catch (err) {
    logger.debug(`buildCallerTree: findReferences failed: ${(err as Error).message}`);
    return [];
  }
};

const symbolEnclosingFirstRef = async (
  filePath: string,
  zeroBasedLine: number,
): Promise<{ name: string; line: number } | null> => {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const table = buildFunctionTable(filePath, text);
    const refLine = zeroBasedLine + 1;
    let best: { name: string; line: number } | null = null;
    for (const fn of table.functions.values()) {
      if (fn.startLine <= refLine && refLine <= fn.endLine) {
        if (!best || fn.startLine > best.line) best = { name: fn.name, line: fn.startLine };
      }
    }
    return best ?? null;
  } catch {
    return null;
  }
};

const nodeKey = (n: Pick<CallerNode, 'filePath' | 'symbol' | 'line'>): string =>
  `${n.filePath}::${n.symbol}::${n.line}`;
