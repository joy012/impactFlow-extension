import type { Node } from 'web-tree-sitter';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

const TYPE_LIKE = new Set([
  'class_declaration',
  'struct_declaration',
  'interface_declaration',
  'record_declaration',
  'enum_declaration',
]);

const METHOD_LIKE = new Set([
  'method_declaration',
  'constructor_declaration',
  'destructor_declaration',
  'operator_declaration',
  'property_declaration',
]);

export const extractCsharpFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('csharp'));
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
    if (c.type === 'namespace_declaration' || c.type === 'file_scoped_namespace_declaration') {
      const name = c.childForFieldName('name')?.text ?? '';
      walk(c, name ? [...scope, name] : scope, filePath, out);
      continue;
    }
    if (TYPE_LIKE.has(c.type)) {
      const name = c.childForFieldName('name')?.text ?? '(anonymous)';
      const body = c.childForFieldName('body');
      if (body) walk(body, [...scope, name], filePath, out);
      continue;
    }
    if (METHOD_LIKE.has(c.type)) {
      emitMethod(c, scope, filePath, out);
      continue;
    }
    if (c.type === 'declaration_list' || c.type === 'compilation_unit') {
      walk(c, scope, filePath, out);
    }
  }
};

const emitMethod = (
  m: Node,
  scope: string[],
  filePath: string,
  out: Map<string, FnEntry>,
): void => {
  const name = m.childForFieldName('name')?.text ?? '(anonymous)';
  const qualified = scope.length ? `${scope.join('.')}.${name}` : name;
  const isExported = hasPublic(m);
  const fullText = m.text;
  const leadingDocText = collectLeadingComments(m);
  const id = `${filePath}::${qualified}`;
  out.set(id, {
    id,
    name: qualified,
    kind: 'method',
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

const hasPublic = (m: Node): boolean => {
  for (let i = 0; i < m.childCount; i++) {
    const c = m.child(i);
    if (c?.type === 'modifier' && c.text === 'public') return true;
  }
  return false;
};
