import type { Node } from 'web-tree-sitter';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

export const extractJavaFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('java'));
  const tree = parser.parse(text);
  const out = new Map<string, FnEntry>();
  if (!tree) {
    parser.delete();
    return { filePath, functions: out };
  }
  walkProgram(tree.rootNode, [], filePath, out);
  tree.delete();
  parser.delete();
  return { filePath, functions: out };
};

const CLASS_LIKE = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
  'annotation_type_declaration',
]);

const walkProgram = (
  node: Node,
  scope: string[],
  filePath: string,
  out: Map<string, FnEntry>,
): void => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (!c) continue;
    if (CLASS_LIKE.has(c.type)) {
      const className = c.childForFieldName('name')?.text ?? '(anonymous)';
      const body = c.childForFieldName('body');
      if (body) walkClassBody(body, [...scope, className], filePath, out);
    }
  }
};

const walkClassBody = (
  body: Node,
  scope: string[],
  filePath: string,
  out: Map<string, FnEntry>,
): void => {
  for (let i = 0; i < body.namedChildCount; i++) {
    const m = body.namedChild(i);
    if (!m) continue;
    if (m.type === 'method_declaration' || m.type === 'constructor_declaration') {
      emitMethod(m, scope, filePath, out);
    } else if (CLASS_LIKE.has(m.type)) {
      // nested type
      const nm = m.childForFieldName('name')?.text ?? '(anonymous)';
      const inner = m.childForFieldName('body');
      if (inner) walkClassBody(inner, [...scope, nm], filePath, out);
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
  const isExported = hasPublicModifier(m);
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

const hasPublicModifier = (m: Node): boolean => {
  for (let i = 0; i < m.childCount; i++) {
    const c = m.child(i);
    if (c?.type === 'modifiers') {
      for (let j = 0; j < c.childCount; j++) {
        if (c.child(j)?.text === 'public') return true;
      }
      return false;
    }
  }
  // No modifiers = package-private; treat as not exported.
  return false;
};
