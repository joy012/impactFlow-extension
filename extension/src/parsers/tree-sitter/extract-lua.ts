import type { Node } from 'web-tree-sitter';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

export const extractLuaFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('lua'));
  const tree = parser.parse(text);
  const out = new Map<string, FnEntry>();
  if (!tree) {
    parser.delete();
    return { filePath, functions: out };
  }
  const root = tree.rootNode;
  // `local function name` shows up as a regular function_declaration child of `chunk`
  // but with field name "local_declaration" — that's how the grammar marks it.
  for (let i = 0; i < root.childCount; i++) {
    const child = root.child(i);
    if (!child || child.type !== 'function_declaration') continue;
    const fieldName = root.fieldNameForChild(i);
    const isLocal = fieldName === 'local_declaration';
    emitFunction(child, isLocal, filePath, out);
  }
  tree.delete();
  parser.delete();
  return { filePath, functions: out };
};

const emitFunction = (
  fn: Node,
  isLocal: boolean,
  filePath: string,
  out: Map<string, FnEntry>,
): void => {
  const nameNode = fn.childForFieldName('name');
  if (!nameNode) return;
  const name = nameNode.text;
  // local function or _-prefixed = private.
  const isExported = !isLocal && !name.startsWith('_');
  const fullText = fn.text;
  const leadingDocText = collectLeadingComments(fn);
  const id = `${filePath}::${name}`;
  out.set(id, {
    id,
    name,
    kind: name.includes(':') || name.includes('.') ? 'method' : 'function',
    startLine: startLine(fn),
    endLine: endLine(fn),
    bodyHash: hashBody(fullText, 'ts'),
    fullText,
    filePath,
    isExported,
    leadingDocText,
    leadingDocHash: hashDoc(leadingDocText),
  });
};
