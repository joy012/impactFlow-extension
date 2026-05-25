import type { Node } from 'web-tree-sitter';
import { getLoadedGrammar } from '../parsers/tree-sitter/grammar-cache.js';
import { newParser } from '../parsers/tree-sitter/init.js';
import { type EffectKind, detectEffects } from './effect-patterns.js';
import { FN_NODE_TYPES, JS_TS_KEYWORDS } from './facts-constants.js';

export interface FnFacts {
  paramSig: string;
  returnType: string | null;
  isAsync: boolean;
  isGenerator: boolean;
  returnExprs: string[];
  callSites: string[];
  throws: string[];
  branchConditions: string[];
  effects: Set<EffectKind>;
  /** Identifier-stripped structural string. */
  skeleton: string;
  /** 1 + (branches + catch clauses + logical operators in conditions). */
  complexity: number;
}

type FnKind = 'function' | 'method' | 'arrow' | 'default-export';

export const extractFacts = (text: string, kind: FnKind): FnFacts => {
  const wrapped = wrap(text, kind);
  const parser = newParser();
  parser.setLanguage(getLoadedGrammar('tsx'));
  const tree = parser.parse(wrapped);
  try {
    if (!tree) return emptyFacts(text);
    const fn = findFirstFn(tree.rootNode);
    if (!fn) return emptyFacts(text);
    const branchConditions = collectConditions(fn);
    return {
      paramSig: extractParamSig(fn),
      returnType: extractReturnType(fn),
      isAsync: detectAsync(fn),
      isGenerator: detectGenerator(fn),
      returnExprs: sortedUnique(collectReturns(fn)),
      callSites: sortedUnique(collectCallSites(fn)),
      throws: sortedUnique(collectThrows(fn)),
      branchConditions: sortedUnique(branchConditions),
      effects: detectEffects(text),
      skeleton: structuralSkeleton(fn),
      complexity: computeComplexity(fn, branchConditions),
    };
  } finally {
    tree?.delete();
    parser.delete();
  }
};

const wrap = (text: string, kind: FnKind): string => {
  if (kind === 'method') return `class __W { ${text} }`;
  if (text.trimStart().startsWith('(') && !text.includes('=>')) return `const __w = ${text};`;
  if (kind === 'arrow' && !/^\s*(const|let|var|export)/.test(text) && text.includes('=>')) {
    return `const __w = ${text};`;
  }
  return text;
};

const findFirstFn = (root: Node): Node | null => {
  // BFS handles all wrap shapes: direct child, class method, arrow inside declarator.
  const queue: Node[] = [root];
  while (queue.length) {
    const n = queue.shift();
    if (!n) continue;
    if (FN_NODE_TYPES.has(n.type)) return n;
    for (let i = 0; i < n.namedChildCount; i++) {
      const c = n.namedChild(i);
      if (c) queue.push(c);
    }
  }
  return null;
};

const extractParamSig = (fn: Node): string => {
  const params = fn.childForFieldName('parameters');
  if (!params) return '';
  const parts: string[] = [];
  for (let i = 0; i < params.namedChildCount; i++) {
    const p = params.namedChild(i);
    if (p) parts.push(formatParam(p));
  }
  return parts.join(',');
};

const formatParam = (p: Node): string => {
  const pattern = p.childForFieldName('pattern') ?? p.namedChild(0);
  const typeNode = p.childForFieldName('type');
  const valueNode = p.childForFieldName('value');
  const rest = p.type === 'rest_pattern' ? '...' : '';
  const opt = p.type === 'optional_parameter' ? '?' : '';
  const name = pattern?.text ?? '';
  const type = typeNode ? typeNode.text.replace(/^:\s*/, '') : '';
  const init = valueNode ? valueNode.text : '';
  return `${rest}${name}${opt}:${type}${init ? `=${init}` : ''}`;
};

const extractReturnType = (fn: Node): string | null => {
  const rt = fn.childForFieldName('return_type');
  return rt ? rt.text.replace(/^:\s*/, '') : null;
};

const detectAsync = (fn: Node): boolean => {
  for (let i = 0; i < fn.childCount; i++) {
    if (fn.child(i)?.type === 'async') return true;
  }
  return false;
};

const detectGenerator = (fn: Node): boolean => {
  if (fn.type === 'generator_function_declaration' || fn.type === 'generator_function') return true;
  for (let i = 0; i < fn.childCount; i++) {
    if (fn.child(i)?.text === '*') return true;
  }
  return false;
};

const collectReturns = (fn: Node): string[] => {
  const out: string[] = [];
  walk(fn, (n) => {
    if (n.type === 'return_statement') {
      const expr = n.namedChild(0);
      out.push(expr ? expr.text.trim() : '<void>');
      return false;
    }
    return true;
  });
  return out;
};

const collectCallSites = (fn: Node): string[] => {
  const out: string[] = [];
  walk(fn, (n) => {
    if (n.type === 'call_expression') {
      const callee = n.childForFieldName('function');
      if (callee) out.push(callee.text.trim());
    } else if (n.type === 'new_expression') {
      const callee = n.childForFieldName('constructor');
      if (callee) out.push(`new ${callee.text.trim()}`);
    }
    return true;
  });
  return out;
};

const collectThrows = (fn: Node): string[] => {
  const out: string[] = [];
  walk(fn, (n) => {
    if (n.type === 'throw_statement') {
      const expr = n.namedChild(0);
      out.push(expr ? expr.text.trim() : '<empty>');
    }
    return true;
  });
  return out;
};

const collectConditions = (fn: Node): string[] => {
  const out: string[] = [];
  walk(fn, (n) => {
    switch (n.type) {
      case 'if_statement':
      case 'while_statement':
      case 'do_statement': {
        const cond = n.childForFieldName('condition');
        if (cond) out.push(stripParens(cond.text));
        break;
      }
      case 'ternary_expression': {
        const cond = n.childForFieldName('condition');
        if (cond) out.push(cond.text.trim());
        break;
      }
      case 'for_statement': {
        const cond = n.childForFieldName('condition');
        out.push(cond ? cond.text.trim() : '<infinite>');
        break;
      }
      case 'for_in_statement':
        out.push('<for-in>');
        break;
      case 'switch_statement': {
        const val = n.childForFieldName('value');
        if (val) out.push(`switch:${stripParens(val.text)}`);
        break;
      }
    }
    return true;
  });
  return out;
};

const stripParens = (text: string): string => {
  const t = text.trim();
  return t.startsWith('(') && t.endsWith(')') ? t.slice(1, -1).trim() : t;
};

const structuralSkeleton = (fn: Node): string =>
  fn.text
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\b[A-Za-z_$][\w$]*\b/g, (m) => (JS_TS_KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();

const sortedUnique = (xs: string[]): string[] => [...new Set(xs)].sort();

const computeComplexity = (fn: Node, branchConditions: string[]): number => {
  let cc = 1 + branchConditions.length;
  walk(fn, (n) => {
    if (n.type === 'catch_clause') cc += 1;
    if (n.type === 'binary_expression') {
      const op = n.childForFieldName('operator');
      if (op && (op.text === '&&' || op.text === '||')) cc += 1;
    }
    return true;
  });
  return cc;
};

const emptyFacts = (text: string): FnFacts => ({
  paramSig: '',
  returnType: null,
  isAsync: false,
  isGenerator: false,
  returnExprs: [],
  callSites: [],
  throws: [],
  branchConditions: [],
  effects: detectEffects(text),
  skeleton: text.replace(/\s+/g, ' ').trim(),
  complexity: 1,
});

const walk = (node: Node, visit: (n: Node) => boolean) => {
  const stack: Node[] = [node];
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    if (n !== node) {
      const descend = visit(n);
      if (!descend) continue;
    }
    for (let i = n.namedChildCount - 1; i >= 0; i--) {
      const c = n.namedChild(i);
      if (c) stack.push(c);
    }
  }
};
