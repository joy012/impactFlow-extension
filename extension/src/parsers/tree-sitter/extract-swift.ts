import type { Node } from 'web-tree-sitter';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

const TYPE_LIKE = new Set(['class_declaration', 'protocol_declaration', 'extension_declaration']);

export const extractSwiftFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('swift'));
  const tree = parser.parse(text);
  const out = new Map<string, FnEntry>();
  if (!tree) {
    parser.delete();
    return { filePath, functions: out };
  }
  walk(tree.rootNode, [], filePath, out);
  tree.delete();
  parser.delete();
  return { filePath, functions: out };
};

const walk = (node: Node, scope: string[], filePath: string, out: Map<string, FnEntry>): void => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (!c) continue;

    if (TYPE_LIKE.has(c.type)) {
      const name = c.childForFieldName('name')?.text ?? '(anonymous)';
      const body = c.childForFieldName('body');
      if (body) walk(body, [...scope, name], filePath, out);
      continue;
    }

    if (c.type === 'function_declaration') {
      emit(c, scope, filePath, out);
      continue;
    }

    if (c.type === 'class_body') {
      walk(c, scope, filePath, out);
    }
  }
};

const findChild = (node: Node, type: string): Node | null => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c?.type === type) return c;
  }
  return null;
};

const emit = (fn: Node, scope: string[], filePath: string, out: Map<string, FnEntry>): void => {
  // childForFieldName('name') returns the FIRST `name` field; for function_declaration
  // tree-sitter-swift attaches multiple `name` fields (one per param label group).
  // The first one is the function identifier.
  const nameNode = fn.childForFieldName('name');
  const name = nameNode?.text ?? '(anonymous)';
  const qualified = scope.length ? `${scope.join('.')}.${name}` : name;
  const isExported = !isPrivateOrFileprivate(fn);
  const fullText = fn.text;
  const leadingDocText = collectLeadingComments(fn);
  const id = `${filePath}::${qualified}`;
  out.set(id, {
    id,
    name: qualified,
    kind: scope.length ? 'method' : 'function',
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

const isPrivateOrFileprivate = (fn: Node): boolean => {
  const mods = findChild(fn, 'modifiers');
  if (!mods) return false;
  for (let i = 0; i < mods.namedChildCount; i++) {
    const c = mods.namedChild(i);
    if (c?.type === 'visibility_modifier') {
      const t = c.text;
      if (t === 'private' || t === 'fileprivate') return true;
    }
  }
  return false;
};
