/**
 * Extract FnFacts from a function's full text.
 * One-pass AST walk; detectors compare two FnFacts objects.
 */

import {
  type ArrowFunction,
  type ConstructorDeclaration,
  type FunctionDeclaration,
  type FunctionExpression,
  type GetAccessorDeclaration,
  type MethodDeclaration,
  Node,
  Project,
  ScriptKind,
  type SetAccessorDeclaration,
  SyntaxKind,
} from 'ts-morph';
import { type EffectKind, detectEffects } from './effect-patterns.js';

type AnyFn =
  | FunctionDeclaration
  | FunctionExpression
  | ArrowFunction
  | MethodDeclaration
  | ConstructorDeclaration
  | GetAccessorDeclaration
  | SetAccessorDeclaration;

export interface FnFacts {
  paramSig: string;
  returnType: string | null;
  isAsync: boolean;
  isGenerator: boolean;
  /** Sorted, unique. */
  returnExprs: string[];
  /** Sorted, unique called identifiers — 'fetch', 'this.foo', 'axios.get'. */
  callSites: string[];
  /** Sorted, unique throw expressions. */
  throws: string[];
  /** Sorted, unique branch condition texts. */
  branchConditions: string[];
  effects: Set<EffectKind>;
  /** Token-equivalence skeleton — identifier-stripped structural string. */
  skeleton: string;
  /** Cyclomatic complexity — 1 + (branches + catch clauses + logical operators in conditions). */
  complexity: number;
}

const project = new Project({
  useInMemoryFileSystem: true,
  skipAddingFilesFromTsConfig: true,
  compilerOptions: { allowJs: true, jsx: 4, target: 99, module: 99 },
});

/**
 * Parses a function text in isolation and returns its facts.
 * `text` should be a complete function (decl/expr/method), not just the body.
 */
export function extractFacts(
  text: string,
  kind: 'function' | 'method' | 'arrow' | 'default-export',
): FnFacts {
  const wrapped = wrap(text, kind);
  const virtual = `virtual:facts-${Math.random().toString(36).slice(2)}.tsx`;
  const sf = project.createSourceFile(virtual, wrapped, {
    scriptKind: ScriptKind.TSX,
    overwrite: true,
  });
  try {
    const fn = findFirstFn(sf);
    if (!fn) {
      return emptyFacts(text);
    }
    const branchConditions = collectConditions(fn);
    return {
      paramSig: extractParamSig(fn),
      returnType: extractReturnType(fn),
      isAsync: 'isAsync' in fn ? fn.isAsync() : false,
      isGenerator: 'isGenerator' in fn ? fn.isGenerator() : false,
      returnExprs: sortedUnique(collectReturns(fn)),
      callSites: sortedUnique(collectCallSites(fn)),
      throws: sortedUnique(collectThrows(fn)),
      branchConditions: sortedUnique(branchConditions),
      effects: detectEffects(text),
      skeleton: structuralSkeleton(fn),
      complexity: computeComplexity(fn, branchConditions),
    };
  } finally {
    sf.forget();
  }
}

function wrap(
  text: string,
  kind: FnFacts extends never ? never : 'function' | 'method' | 'arrow' | 'default-export',
): string {
  // Standalone class methods/get/set/constructor are not valid top-level — wrap them in a class.
  if (kind === 'method') return `class __W { ${text} }`;
  // Default-export arrow text already starts with `(`. Wrap as a statement.
  if (text.trimStart().startsWith('(') && !text.includes('=>')) return `const __w = ${text};`;
  // Arrow assignments arrive as the RHS expression text only.
  if (kind === 'arrow' && !/^\s*(const|let|var|export)/.test(text) && text.includes('=>')) {
    return `const __w = ${text};`;
  }
  return text;
}

function findFirstFn(sf: ReturnType<Project['createSourceFile']>): AnyFn | undefined {
  const fns = sf.getFunctions();
  if (fns[0]) return fns[0];
  for (const cls of sf.getClasses()) {
    const m = cls.getInstanceMethods()[0] ?? cls.getStaticMethods()[0];
    if (m) return m;
    const ctor = cls.getConstructors()[0];
    if (ctor) return ctor;
    const acc = cls
      .getInstanceProperties()
      .find(
        (p) => p.getKind() === SyntaxKind.GetAccessor || p.getKind() === SyntaxKind.SetAccessor,
      );
    if (acc) return acc as AnyFn;
  }
  for (const stmt of sf.getVariableStatements()) {
    for (const d of stmt.getDeclarations()) {
      const init = d.getInitializer();
      if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) return init;
    }
  }
  return undefined;
}

function extractParamSig(fn: AnyFn): string {
  const params = fn.getParameters();
  return params
    .map((p) => {
      const name = p.getName();
      const type = p.getTypeNode()?.getText() ?? '';
      const init = p.getInitializer()?.getText() ?? '';
      const opt = p.hasQuestionToken() ? '?' : '';
      const rest = p.isRestParameter() ? '...' : '';
      return `${rest}${name}${opt}:${type}${init ? `=${init}` : ''}`;
    })
    .join(',');
}

function extractReturnType(fn: AnyFn): string | null {
  const tn = (
    fn as { getReturnTypeNode?: () => { getText(): string } | undefined }
  ).getReturnTypeNode?.();
  return tn?.getText() ?? null;
}

function collectReturns(fn: AnyFn): string[] {
  const out: string[] = [];
  fn.forEachDescendant((node) => {
    if (Node.isReturnStatement(node)) {
      out.push(node.getExpression()?.getText().trim() ?? '<void>');
    }
  });
  return out;
}

function collectCallSites(fn: AnyFn): string[] {
  const out: string[] = [];
  fn.forEachDescendant((node) => {
    if (Node.isCallExpression(node)) {
      out.push(node.getExpression().getText().trim());
    } else if (Node.isNewExpression(node)) {
      out.push(`new ${node.getExpression().getText().trim()}`);
    }
  });
  return out;
}

function collectThrows(fn: AnyFn): string[] {
  const out: string[] = [];
  fn.forEachDescendant((node) => {
    if (Node.isThrowStatement(node)) {
      out.push(node.getExpression()?.getText().trim() ?? '<empty>');
    }
  });
  return out;
}

function collectConditions(fn: AnyFn): string[] {
  const out: string[] = [];
  fn.forEachDescendant((node) => {
    if (Node.isIfStatement(node)) out.push(node.getExpression().getText().trim());
    else if (Node.isConditionalExpression(node)) out.push(node.getCondition().getText().trim());
    else if (Node.isWhileStatement(node) || Node.isDoStatement(node))
      out.push(node.getExpression().getText().trim());
    else if (Node.isForStatement(node))
      out.push(node.getCondition()?.getText().trim() ?? '<infinite>');
    else if (Node.isSwitchStatement(node))
      out.push(`switch:${node.getExpression().getText().trim()}`);
  });
  return out;
}

/** Identifier-stripped structural fingerprint. Two functions with equal skeletons
 *  but different identifiers are pure renames.
 *  Preserves keywords + literals so semantic differences are not collapsed. */
const KEYWORDS = new Set([
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'throw',
  'try',
  'catch',
  'finally',
  'new',
  'delete',
  'typeof',
  'instanceof',
  'void',
  'this',
  'super',
  'class',
  'extends',
  'implements',
  'interface',
  'type',
  'enum',
  'const',
  'let',
  'var',
  'export',
  'import',
  'from',
  'as',
  'async',
  'await',
  'yield',
  'true',
  'false',
  'null',
  'undefined',
  'in',
  'of',
  'public',
  'private',
  'protected',
  'static',
  'readonly',
  'abstract',
  'override',
  'declare',
  'namespace',
  'module',
  'any',
  'number',
  'string',
  'boolean',
  'object',
  'symbol',
  'never',
  'unknown',
  'bigint',
  'get',
  'set',
  'keyof',
  'is',
  'satisfies',
  'infer',
]);

function structuralSkeleton(fn: AnyFn): string {
  return fn
    .getText()
    .replace(/\/\/[^\n]*/g, '') // line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/\b[A-Za-z_$][\w$]*\b/g, (m) => (KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '') // strip all whitespace; the identifier pass already separated tokens
    .trim();
}

function sortedUnique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}

function computeComplexity(fn: AnyFn, branchConditions: string[]): number {
  // Cyclomatic = 1 + (branches) + (catch clauses) + (logical &&/|| in conditions).
  let cc = 1 + branchConditions.length;
  fn.forEachDescendant((node) => {
    if (Node.isCatchClause(node)) cc += 1;
    if (Node.isBinaryExpression(node)) {
      const op = node.getOperatorToken().getKind();
      if (op === SyntaxKind.AmpersandAmpersandToken || op === SyntaxKind.BarBarToken) cc += 1;
    }
  });
  return cc;
}

function emptyFacts(text: string): FnFacts {
  return {
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
  };
}
