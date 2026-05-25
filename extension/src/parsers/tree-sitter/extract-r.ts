import type { Node } from 'web-tree-sitter';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

const ASSIGNMENT_OPS = new Set(['<-', '<<-', '=']);

export const extractRFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('r'));
  const tree = parser.parse(text);
  const out = new Map<string, FnEntry>();
  if (!tree) {
    parser.delete();
    return { filePath, functions: out };
  }
  walk(tree.rootNode, filePath, out);
  tree.delete();
  parser.delete();
  return { filePath, functions: out };
};

const walk = (node: Node, filePath: string, out: Map<string, FnEntry>): void => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (!c) continue;
    if (c.type === 'binary_operator') {
      // Looking for: <identifier> <- function(...) { ... }
      const op = c.childForFieldName('operator');
      const lhs = c.childForFieldName('lhs');
      const rhs = c.childForFieldName('rhs');
      if (
        op &&
        ASSIGNMENT_OPS.has(op.text) &&
        lhs?.type === 'identifier' &&
        rhs?.type === 'function_definition'
      ) {
        emit(c, lhs.text, filePath, out);
        continue;
      }
    }
    walk(c, filePath, out);
  }
};

const emit = (binary: Node, name: string, filePath: string, out: Map<string, FnEntry>): void => {
  // R convention: leading dot (.name) usually indicates an internal/non-exported helper.
  const isExported = !name.startsWith('.');
  const fullText = binary.text;
  const leadingDocText = collectLeadingComments(binary);
  const id = `${filePath}::${name}`;
  out.set(id, {
    id,
    name,
    kind: 'function',
    startLine: startLine(binary),
    endLine: endLine(binary),
    // R uses '#' for comments; the python branch of hashBody strips '#…\n'.
    bodyHash: hashBody(fullText, 'python'),
    fullText,
    filePath,
    isExported,
    leadingDocText,
    leadingDocHash: hashDoc(leadingDocText),
  });
};
