import type { Node } from 'web-tree-sitter';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

export const extractRustFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('rust'));
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

const walk = (node: Node, scope: string[], filePath: string, out: Map<string, FnEntry>) => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (!c) continue;
    if (c.type === 'function_item') emitFn(c, scope, filePath, out);
    else if (c.type === 'impl_item') {
      const typeNode = c.childForFieldName('type');
      const typeName = typeNode?.text ?? '(impl)';
      const body = c.childForFieldName('body');
      if (body) walk(body, [...scope, typeName], filePath, out);
    } else if (c.type === 'mod_item') {
      const name = c.childForFieldName('name')?.text ?? '(mod)';
      const body = c.childForFieldName('body');
      if (body) walk(body, [...scope, name], filePath, out);
    } else if (c.type === 'trait_item') {
      const name = c.childForFieldName('name')?.text ?? '(trait)';
      const body = c.childForFieldName('body');
      if (body) walk(body, [...scope, name], filePath, out);
    } else if (c.type === 'declaration_list' || c.type === 'source_file') {
      walk(c, scope, filePath, out);
    }
  }
};

const emitFn = (fn: Node, scope: string[], filePath: string, out: Map<string, FnEntry>) => {
  const name = fn.childForFieldName('name')?.text ?? '(anonymous)';
  const qualified = scope.length ? `${scope.join('.')}.${name}` : name;
  const isExported = hasPub(fn);
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

const hasPub = (fn: Node): boolean => {
  for (let i = 0; i < fn.childCount; i++) {
    const c = fn.child(i);
    if (c?.type === 'visibility_modifier') return true;
  }
  return false;
};
