import type { Node } from 'web-tree-sitter';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

export const extractPythonFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('python'));
  const tree = parser.parse(text);
  const functions = new Map<string, FnEntry>();
  if (!tree) {
    parser.delete();
    return { filePath, functions };
  }
  walk(tree.rootNode, [], filePath, functions);
  tree.delete();
  parser.delete();
  return { filePath, functions };
};

const walk = (node: Node, classStack: string[], filePath: string, out: Map<string, FnEntry>) => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;

    if (child.type === 'class_definition') {
      const className = child.childForFieldName('name')?.text ?? '(anonymous)';
      const body = child.childForFieldName('body');
      if (body) walk(body, [...classStack, className], filePath, out);
      continue;
    }

    if (child.type === 'decorated_definition') {
      const inner = child.childForFieldName('definition');
      if (!inner) continue;
      if (inner.type === 'class_definition') {
        const className = inner.childForFieldName('name')?.text ?? '(anonymous)';
        const body = inner.childForFieldName('body');
        if (body) walk(body, [...classStack, className], filePath, out);
        continue;
      }
      if (inner.type === 'function_definition') {
        emitFunction(inner, child, classStack, filePath, out);
      }
      continue;
    }

    if (child.type === 'function_definition') {
      emitFunction(child, child, classStack, filePath, out);
      continue;
    }

    walk(child, classStack, filePath, out);
  }
};

const emitFunction = (
  fn: Node,
  outerForDoc: Node,
  classStack: string[],
  filePath: string,
  out: Map<string, FnEntry>,
) => {
  const nameNode = fn.childForFieldName('name');
  if (!nameNode) return;
  const name = nameNode.text;
  const qualified = classStack.length ? `${classStack.join('.')}.${name}` : name;
  const kind: FnEntry['kind'] = classStack.length > 0 ? 'method' : 'function';

  const fullText = outerForDoc.text;
  const docText = collectPythonLeadingDoc(fn, outerForDoc);
  // `_name` is Python's private convention; dunder methods are public surface.
  const isExported = !name.startsWith('_') || name === '__init__' || name === '__call__';
  const id = `${filePath}::${qualified}`;

  out.set(id, {
    id,
    name: qualified,
    kind,
    startLine: startLine(outerForDoc),
    endLine: endLine(outerForDoc),
    bodyHash: hashBody(fullText, 'python'),
    fullText,
    filePath,
    isExported,
    leadingDocText: docText,
    leadingDocHash: hashDoc(docText),
  });
};

const collectPythonLeadingDoc = (fn: Node, outer: Node): string => {
  const parts: string[] = [];

  if (outer.type === 'decorated_definition') {
    for (let i = 0; i < outer.namedChildCount; i++) {
      const c = outer.namedChild(i);
      if (c?.type === 'decorator') parts.push(c.text.trim());
    }
  }

  const commentLead = collectLeadingComments(outer);
  if (commentLead) parts.unshift(commentLead);

  // Docstring = first statement of the body if it's a string literal.
  const body = fn.childForFieldName('body');
  if (body) {
    const firstStmt = body.namedChild(0);
    if (firstStmt?.type === 'expression_statement') {
      const expr = firstStmt.namedChild(0);
      if (expr?.type === 'string') parts.push(expr.text.trim());
    }
  }

  return parts.join('\n').trim();
};
