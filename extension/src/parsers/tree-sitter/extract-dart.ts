import type { Node } from 'web-tree-sitter';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

export const extractDartFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('dart'));
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

    if (c.type === 'class_definition' || c.type === 'mixin_declaration') {
      const className = c.childForFieldName('name')?.text ?? '(anonymous)';
      const body = c.childForFieldName('body');
      if (body) walk(body, [...scope, className], filePath, out);
      continue;
    }

    if (c.type === 'declaration') {
      const sig = findFnLikeSignature(c);
      if (sig) {
        emit(c, c, sig, scope, filePath, out);
        continue;
      }
    }

    if (c.type === 'method_signature') {
      const inner = findChild(c, 'function_signature') ?? c;
      // Method body is a sibling node in tree-sitter-dart's class_body.
      const next = node.namedChild(i + 1);
      const endNode = next?.type === 'function_body' ? next : c;
      emit(c, endNode, inner, scope, filePath, out);
      if (endNode === next) i++;
      continue;
    }

    if (c.type === 'function_signature') {
      // Top-level Dart fns: function_signature + sibling function_body at program level.
      const next = node.namedChild(i + 1);
      const endNode = next?.type === 'function_body' ? next : c;
      emit(c, endNode, c, scope, filePath, out);
      if (endNode === next) i++;
      continue;
    }

    walk(c, scope, filePath, out);
  }
};

const findFnLikeSignature = (node: Node): Node | null => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (!c) continue;
    if (
      c.type === 'function_signature' ||
      c.type === 'constructor_signature' ||
      c.type === 'method_signature'
    )
      return c;
  }
  return null;
};

const findChild = (node: Node, type: string): Node | null => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const ch = node.namedChild(i);
    if (ch?.type === type) return ch;
  }
  return null;
};

const emit = (
  startNode: Node,
  endNode: Node,
  sig: Node,
  scope: string[],
  filePath: string,
  out: Map<string, FnEntry>,
): void => {
  const name = sig.childForFieldName('name')?.text ?? '(anonymous)';
  const qualified = scope.length ? `${scope.join('.')}.${name}` : name;
  // Dart convention: `_name` is library-private.
  const isExported = !name.startsWith('_');
  // Splice the source text from startNode.startIndex to endNode.endIndex to capture
  // both the signature and (when present) the sibling function_body.
  const fullText =
    startNode === endNode
      ? startNode.text
      : (startNode.tree?.rootNode.text.slice(startNode.startIndex, endNode.endIndex) ??
        startNode.text);
  const leadingDocText = collectLeadingComments(startNode);
  const id = `${filePath}::${qualified}`;
  out.set(id, {
    id,
    name: qualified,
    kind: scope.length ? 'method' : 'function',
    startLine: startLine(startNode),
    endLine: endLine(endNode),
    bodyHash: hashBody(fullText, 'ts'),
    fullText,
    filePath,
    isExported,
    leadingDocText,
    leadingDocHash: hashDoc(leadingDocText),
  });
};
