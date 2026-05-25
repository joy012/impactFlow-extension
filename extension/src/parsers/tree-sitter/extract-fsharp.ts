import type { Node } from 'web-tree-sitter';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

export const extractFsharpFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('fsharp'));
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

    if (c.type === 'named_module') {
      const nameNode = c.childForFieldName('name');
      const mod = nameNode?.text ?? '(module)';
      walk(c, [...scope, mod], filePath, out);
      continue;
    }

    if (c.type === 'function_or_value_defn' || c.type === 'value_declaration') {
      const head = findChild(c, 'function_declaration_left');
      if (head) {
        emitFunction(c, head, scope, filePath, out);
        continue;
      }
    }

    walk(c, scope, filePath, out);
  }
};

const findChild = (node: Node, type: string): Node | null => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c?.type === type) return c;
  }
  return null;
};

const findChildText = (node: Node, type: string): string | null => {
  const c = findChild(node, type);
  return c?.text ?? null;
};

const emitFunction = (
  defn: Node,
  head: Node,
  scope: string[],
  filePath: string,
  out: Map<string, FnEntry>,
): void => {
  const name = findChildText(head, 'identifier') ?? '(anonymous)';
  const access = findChildText(head, 'access_modifier');
  const isExported = access !== 'private' && access !== 'internal';
  const qualified = scope.length ? `${scope.join('.')}.${name}` : name;

  const fullText = defn.text;
  const leadingDocText = collectLeadingComments(defn);
  const id = `${filePath}::${qualified}`;
  out.set(id, {
    id,
    name: qualified,
    kind: scope.length ? 'method' : 'function',
    startLine: startLine(defn),
    endLine: endLine(defn),
    bodyHash: hashBody(fullText, 'ts'),
    fullText,
    filePath,
    isExported,
    leadingDocText,
    leadingDocHash: hashDoc(leadingDocText),
  });
};
