import type { Node } from 'web-tree-sitter';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

export const extractGoFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('go'));
  const tree = parser.parse(text);
  const functions = new Map<string, FnEntry>();
  if (!tree) {
    parser.delete();
    return { filePath, functions };
  }
  for (let i = 0; i < tree.rootNode.namedChildCount; i++) {
    const child = tree.rootNode.namedChild(i);
    if (!child) continue;
    if (child.type === 'function_declaration') emitFunction(child, filePath, functions);
    else if (child.type === 'method_declaration') emitMethod(child, filePath, functions);
  }
  tree.delete();
  parser.delete();
  return { filePath, functions };
};

const emitFunction = (fn: Node, filePath: string, out: Map<string, FnEntry>) => {
  const name = fn.childForFieldName('name')?.text;
  if (!name) return;
  emit(fn, name, 'function', isGoExported(name), filePath, out);
};

const emitMethod = (method: Node, filePath: string, out: Map<string, FnEntry>) => {
  const name = method.childForFieldName('name')?.text;
  if (!name) return;
  const receiver = method.childForFieldName('receiver');
  const recvType = extractReceiverType(receiver);
  const qualified = recvType ? `${recvType}.${name}` : name;
  emit(method, qualified, 'method', isGoExported(name), filePath, out);
};

const extractReceiverType = (receiver: Node | null): string | null => {
  if (!receiver) return null;
  // receiver = parameter_list with a single parameter_declaration containing a type.
  // Type may be `T`, `*T`, or `(s *T)`. We want the inner type_identifier text.
  let typeNode: Node | null = null;
  walk(receiver, (n) => {
    if (n.type === 'type_identifier') {
      typeNode = n;
      return false;
    }
    return true;
  });
  return typeNode ? (typeNode as Node).text : null;
};

const emit = (
  node: Node,
  name: string,
  kind: FnEntry['kind'],
  isExported: boolean,
  filePath: string,
  out: Map<string, FnEntry>,
) => {
  const fullText = node.text;
  const leadingDocText = collectLeadingComments(node);
  const id = `${filePath}::${name}`;
  out.set(id, {
    id,
    name,
    kind,
    startLine: startLine(node),
    endLine: endLine(node),
    bodyHash: hashBody(fullText, 'ts'),
    fullText,
    filePath,
    isExported,
    leadingDocText,
    leadingDocHash: hashDoc(leadingDocText),
  });
};

// Go's exported-by-capital-letter convention.
const isGoExported = (name: string): boolean => /^[A-Z]/.test(name);

const walk = (node: Node, visit: (n: Node) => boolean) => {
  const stack: Node[] = [node];
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    if (n !== node && !visit(n)) continue;
    for (let i = n.namedChildCount - 1; i >= 0; i--) {
      const c = n.namedChild(i);
      if (c) stack.push(c);
    }
  }
};
