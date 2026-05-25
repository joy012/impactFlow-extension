import type { Node } from 'web-tree-sitter';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

export const extractPowershellFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('powershell'));
  const tree = parser.parse(text);
  const out = new Map<string, FnEntry>();
  if (!tree) {
    parser.delete();
    return { filePath, functions: out };
  }
  walk(tree.rootNode, filePath, out);
  tree.delete();
  parser.delete();
  return { filePath, functions: out };
};

const walk = (node: Node, filePath: string, out: Map<string, FnEntry>): void => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (!c) continue;
    if (c.type === 'function_statement') {
      emitFunction(c, filePath, out);
      continue;
    }
    walk(c, filePath, out);
  }
};

const emitFunction = (fn: Node, filePath: string, out: Map<string, FnEntry>): void => {
  let nameNode: Node | null = null;
  for (let i = 0; i < fn.namedChildCount; i++) {
    const c = fn.namedChild(i);
    if (c?.type === 'function_name') {
      nameNode = c;
      break;
    }
  }
  if (!nameNode) return;

  // `private:Foo` / `global:Foo` / `script:Foo` — strip the scope prefix.
  const raw = nameNode.text;
  const colon = raw.lastIndexOf(':');
  const scope = colon >= 0 ? raw.slice(0, colon) : '';
  const name = colon >= 0 ? raw.slice(colon + 1) : raw;
  // `private` and `script` are non-public PS scopes.
  const isExported = scope !== 'private' && scope !== 'script';

  const fullText = fn.text;
  const leadingDocText = collectLeadingComments(fn);
  const id = `${filePath}::${name}`;
  out.set(id, {
    id,
    name,
    kind: 'function',
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
