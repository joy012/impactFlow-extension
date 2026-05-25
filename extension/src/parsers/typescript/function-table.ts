import { extractTsFunctions } from '../tree-sitter/extract-ts.js';

export type FunctionKind = 'function' | 'method' | 'arrow' | 'default-export';

export interface FnEntry {
  id: string;
  name: string;
  kind: FunctionKind;
  startLine: number;
  endLine: number;
  /** Normalized body hash — equal hashes mean the body did not change. */
  bodyHash: string;
  fullText: string;
  filePath: string;
  isExported: boolean;
  leadingDocText: string;
  leadingDocHash: string;
}

export interface FunctionTable {
  filePath: string;
  /** Keyed by FnEntry.id. */
  functions: Map<string, FnEntry>;
}

export const buildFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractTsFunctions(filePath, text);
