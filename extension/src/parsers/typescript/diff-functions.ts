/**
 * Set diff between two FunctionTables of the same file.
 */

import type { FnEntry, FunctionTable } from './function-table.js';

export interface FunctionTableDiff {
  filePath: string;
  added: FnEntry[];
  removed: FnEntry[];
  modified: Array<{ before: FnEntry; after: FnEntry }>;
}

export function diffFunctionTables(before: FunctionTable, after: FunctionTable): FunctionTableDiff {
  const added: FnEntry[] = [];
  const removed: FnEntry[] = [];
  const modified: Array<{ before: FnEntry; after: FnEntry }> = [];

  for (const [id, afterFn] of after.functions) {
    const beforeFn = before.functions.get(id);
    if (!beforeFn) {
      added.push(afterFn);
    } else if (beforeFn.bodyHash !== afterFn.bodyHash) {
      modified.push({ before: beforeFn, after: afterFn });
    }
  }

  for (const [id, beforeFn] of before.functions) {
    if (!after.functions.has(id)) removed.push(beforeFn);
  }

  return { filePath: after.filePath, added, removed, modified };
}

export function emptyTable(filePath: string): FunctionTable {
  return { filePath, functions: new Map() };
}
