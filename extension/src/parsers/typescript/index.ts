/**
 * TypeScript / JavaScript AST parser — Phase 1.
 * Uses ts-morph to extract a FunctionTable per file.
 */

export interface FunctionNode {
  id: string;
  name: string;
  calls: string[];
  modifiesState: boolean;
}

export interface FileNode {
  path: string;
  functions: FunctionNode[];
}

export function parseFile(_path: string): FileNode {
  return { path: _path, functions: [] };
}
