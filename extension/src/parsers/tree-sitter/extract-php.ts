import type { Node } from 'web-tree-sitter';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

const TYPE_LIKE = new Set([
  'class_declaration',
  'interface_declaration',
  'trait_declaration',
  'enum_declaration',
]);

export const extractPhpFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('php'));
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

const walk = (
  node: Node,
  scope: string[],
  filePath: string,
  out: Map<string, FnEntry>,
): void => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (!c) continue;
    if (c.type === 'function_definition') {
      emit(c, 'function', null, scope, filePath, out);
    } else if (TYPE_LIKE.has(c.type)) {
      const name = c.childForFieldName('name')?.text ?? '(anonymous)';
      const body = c.childForFieldName('body');
      if (body) walk(body, [...scope, name], filePath, out);
    } else if (c.type === 'method_declaration') {
      emit(c, 'method', findVisibility(c), scope, filePath, out);
    } else if (c.type === 'namespace_definition' || c.type === 'declaration_list') {
      walk(c, scope, filePath, out);
    }
  }
};

const emit = (
  m: Node,
  kind: FnEntry['kind'],
  visibility: string | null,
  scope: string[],
  filePath: string,
  out: Map<string, FnEntry>,
): void => {
  const name = m.childForFieldName('name')?.text ?? '(anonymous)';
  const qualified = scope.length ? `${scope.join('.')}.${name}` : name;
  // PHP default visibility is public; an explicit `private` flips it.
  const isExported = visibility ? visibility !== 'private' : true;
  const fullText = m.text;
  const leadingDocText = collectLeadingComments(m);
  const id = `${filePath}::${qualified}`;
  out.set(id, {
    id,
    name: qualified,
    kind,
    startLine: startLine(m),
    endLine: endLine(m),
    bodyHash: hashBody(fullText, 'ts'),
    fullText,
    filePath,
    isExported,
    leadingDocText,
    leadingDocHash: hashDoc(leadingDocText),
  });
};

const findVisibility = (m: Node): string | null => {
  for (let i = 0; i < m.childCount; i++) {
    const c = m.child(i);
    if (c?.type === 'visibility_modifier') return c.text;
  }
  return null;
};
