import type { Node } from 'web-tree-sitter';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

const TYPE_LIKE = new Set([
  'class_definition',
  'object_definition',
  'trait_definition',
  'enum_definition',
]);

export const extractScalaFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('scala'));
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
    if (c.type === 'function_definition' || c.type === 'function_declaration') {
      emit(c, scope, filePath, out);
    } else if (TYPE_LIKE.has(c.type)) {
      const name = c.childForFieldName('name')?.text ?? '(anonymous)';
      const body = c.childForFieldName('body');
      if (body) walk(body, [...scope, name], filePath, out);
    } else if (
      c.type === 'template_body' ||
      c.type === 'package_clause' ||
      c.type === 'package_object'
    ) {
      walk(c, scope, filePath, out);
    }
  }
};

const emit = (fn: Node, scope: string[], filePath: string, out: Map<string, FnEntry>) => {
  const name = fn.childForFieldName('name')?.text ?? '(anonymous)';
  const qualified = scope.length ? `${scope.join('.')}.${name}` : name;
  // Scala default visibility is public unless explicitly modified.
  const isExported = !isPrivate(fn);
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

const isPrivate = (fn: Node): boolean => {
  for (let i = 0; i < fn.childCount; i++) {
    if (fn.child(i)?.type === 'modifiers') {
      const mods = fn.child(i)!;
      for (let j = 0; j < mods.childCount; j++) {
        const t = mods.child(j)?.text;
        if (t === 'private' || t === 'protected') return true;
      }
    }
  }
  return false;
};
