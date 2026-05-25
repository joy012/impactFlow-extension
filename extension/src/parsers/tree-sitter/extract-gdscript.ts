import type { Node } from 'web-tree-sitter';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

export const extractGdscriptFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('gdscript'));
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

    if (c.type === 'class_definition') {
      const className = c.childForFieldName('name')?.text ?? '(anonymous)';
      const body = c.childForFieldName('body');
      if (body) walk(body, [...scope, className], filePath, out);
      continue;
    }

    if (c.type === 'function_definition') {
      emit(c, scope, filePath, out);
      continue;
    }

    if (c.type === 'body' || c.type === 'class_name_statement') {
      walk(c, scope, filePath, out);
    }
  }
};

const emit = (fn: Node, scope: string[], filePath: string, out: Map<string, FnEntry>): void => {
  const name = fn.childForFieldName('name')?.text ?? '(anonymous)';
  const qualified = scope.length ? `${scope.join('.')}.${name}` : name;
  // GDScript convention: `_name` (single underscore) is a Godot lifecycle hook or
  // private; treat as non-exported.
  const isExported = !name.startsWith('_');
  const fullText = fn.text;
  const leadingDocText = collectLeadingComments(fn);
  const id = `${filePath}::${qualified}`;
  out.set(id, {
    id,
    name: qualified,
    kind: scope.length ? 'method' : 'function',
    startLine: startLine(fn),
    endLine: endLine(fn),
    // GDScript uses '#' for comments — same shape as Python.
    bodyHash: hashBody(fullText, 'python'),
    fullText,
    filePath,
    isExported,
    leadingDocText,
    leadingDocHash: hashDoc(leadingDocText),
  });
};
