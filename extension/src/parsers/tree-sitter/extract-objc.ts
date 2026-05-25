import type { Node } from 'web-tree-sitter';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

const CLASS_LIKE = new Set([
  'class_implementation',
  'class_interface',
  'category_implementation',
  'category_interface',
  'protocol_declaration',
]);

export const extractObjcFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('objc'));
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
    if (CLASS_LIKE.has(c.type)) {
      const name = findFirstIdentifier(c) ?? '(anonymous)';
      walk(c, [...scope, name], filePath, out);
    } else if (c.type === 'method_definition' || c.type === 'method_declaration') {
      emitMethod(c, scope, filePath, out);
    } else if (c.type === 'function_definition') {
      // C-style function inside ObjC source.
      const declarator = c.childForFieldName('declarator');
      const name = declarator ? (findFirstIdentifier(declarator) ?? '(anonymous)') : '(anonymous)';
      emit(c, name, 'function', true, filePath, out);
    } else {
      walk(c, scope, filePath, out);
    }
  }
};

const findFirstIdentifier = (node: Node): string | null => {
  const stack: Node[] = [node];
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    if (n !== node && (n.type === 'identifier' || n.type === 'type_identifier')) return n.text;
    for (let i = 0; i < n.namedChildCount; i++) {
      const c = n.namedChild(i);
      if (c) stack.push(c);
    }
  }
  return null;
};

const emitMethod = (m: Node, scope: string[], filePath: string, out: Map<string, FnEntry>) => {
  // Selector: join all selector parts.
  const parts: string[] = [];
  for (let i = 0; i < m.namedChildCount; i++) {
    const c = m.namedChild(i);
    if (!c) continue;
    if (c.type === 'identifier') parts.push(c.text);
    else if (c.type === 'method_selector' || c.type === 'keyword_argument') {
      const id = findFirstIdentifier(c);
      if (id) parts.push(id);
    }
  }
  const name = parts.length ? parts.join(':') : '(selector)';
  const qualified = scope.length ? `${scope.join('.')}.${name}` : name;
  emit(m, qualified, 'method', true, filePath, out);
};

const emit = (
  n: Node,
  name: string,
  kind: FnEntry['kind'],
  isExported: boolean,
  filePath: string,
  out: Map<string, FnEntry>,
) => {
  const fullText = n.text;
  const leadingDocText = collectLeadingComments(n);
  const id = `${filePath}::${name}`;
  out.set(id, {
    id,
    name,
    kind,
    startLine: startLine(n),
    endLine: endLine(n),
    bodyHash: hashBody(fullText, 'ts'),
    fullText,
    filePath,
    isExported,
    leadingDocText,
    leadingDocHash: hashDoc(leadingDocText),
  });
};
