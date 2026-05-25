import type { Node } from 'web-tree-sitter';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

const DEF_NAMES = new Set(['def', 'defp', 'defmacro', 'defmacrop']);
const MODULE_NAMES = new Set(['defmodule']);

export const extractElixirFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('elixir'));
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
    if (c.type === 'call') {
      const head = callTargetName(c);
      if (head && MODULE_NAMES.has(head)) {
        const moduleName = extractFirstAlias(c) ?? '(module)';
        const body = findDoBlock(c);
        if (body) walk(body, [...scope, moduleName], filePath, out);
        continue;
      }
      if (head && DEF_NAMES.has(head)) {
        emitDef(c, head, scope, filePath, out);
        continue;
      }
    }
    walk(c, scope, filePath, out);
  }
};

const callTargetName = (call: Node): string | null => {
  const t = call.childForFieldName('target') ?? call.namedChild(0);
  return t?.type === 'identifier' ? t.text : null;
};

const extractFirstAlias = (call: Node): string | null => {
  const args = findChild(call, 'arguments');
  if (!args) return null;
  for (let i = 0; i < args.namedChildCount; i++) {
    const c = args.namedChild(i);
    if (c?.type === 'alias') return c.text;
  }
  return null;
};

const extractDefName = (call: Node): string | null => {
  const args = findChild(call, 'arguments');
  if (!args) return null;
  // First arg is either:
  //  - identifier (e.g. `def greet, do: :ok`)
  //  - call (e.g. `def greet(x) do ... end` — outer call to greet/1)
  //  - binary_operator (guards, etc.)
  for (let i = 0; i < args.namedChildCount; i++) {
    const c = args.namedChild(i);
    if (!c) continue;
    if (c.type === 'identifier') return c.text;
    if (c.type === 'call') {
      const inner = c.childForFieldName('target') ?? c.namedChild(0);
      if (inner?.type === 'identifier') return inner.text;
    }
    if (c.type === 'binary_operator') {
      // `def foo(x) when guard` — left side is the def head.
      const left = c.childForFieldName('left');
      if (left?.type === 'call') {
        const inner = left.childForFieldName('target') ?? left.namedChild(0);
        if (inner?.type === 'identifier') return inner.text;
      }
      if (left?.type === 'identifier') return left.text;
    }
    break;
  }
  return null;
};

const findDoBlock = (call: Node): Node | null => findChild(call, 'do_block');

const findChild = (node: Node, type: string): Node | null => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c?.type === type) return c;
  }
  return null;
};

const emitDef = (
  call: Node,
  defKind: string,
  scope: string[],
  filePath: string,
  out: Map<string, FnEntry>,
): void => {
  const name = extractDefName(call) ?? '(anonymous)';
  const qualified = scope.length ? `${scope.join('.')}.${name}` : name;
  const isExported = defKind === 'def' || defKind === 'defmacro';
  const fullText = call.text;
  const leadingDocText = collectLeadingComments(call);
  const id = `${filePath}::${qualified}`;
  out.set(id, {
    id,
    name: qualified,
    kind: scope.length ? 'method' : 'function',
    startLine: startLine(call),
    endLine: endLine(call),
    bodyHash: hashBody(fullText, 'python'),
    fullText,
    filePath,
    isExported,
    leadingDocText,
    leadingDocHash: hashDoc(leadingDocText),
  });
};
