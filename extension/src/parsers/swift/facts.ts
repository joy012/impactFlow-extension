import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';

const SWIFT_EFFECT_PATTERNS: Array<{ kind: EffectKind; match: RegExp }> = [
  { kind: 'network', match: /\bURLSession\b|\bURLRequest\b/ },
  { kind: 'fs', match: /\bFileManager\b/ },
  { kind: 'env', match: /\bProcessInfo\.processInfo\.environment\b/ },
  { kind: 'env', match: /\bProcess\(\)/ },
  { kind: 'console', match: /\b(print|NSLog|debugPrint)\s*\(/ },
  { kind: 'fs', match: /\bUserDefaults\.standard\b/ },
];

const SWIFT_KEYWORDS = new Set([
  'associatedtype',
  'class',
  'deinit',
  'enum',
  'extension',
  'fileprivate',
  'func',
  'import',
  'init',
  'inout',
  'internal',
  'let',
  'open',
  'operator',
  'private',
  'protocol',
  'public',
  'static',
  'struct',
  'subscript',
  'typealias',
  'var',
  'break',
  'case',
  'continue',
  'default',
  'defer',
  'do',
  'else',
  'fallthrough',
  'for',
  'guard',
  'if',
  'in',
  'repeat',
  'return',
  'switch',
  'where',
  'while',
  'as',
  'catch',
  'is',
  'rethrows',
  'super',
  'self',
  'Self',
  'throw',
  'throws',
  'try',
  'true',
  'false',
  'nil',
  'async',
  'await',
  'actor',
  'mutating',
  'nonmutating',
  'final',
  'override',
  'required',
  'convenience',
  'lazy',
  'weak',
  'unowned',
  'some',
  'any',
]);

export function extractSwiftFacts(text: string): FnFacts {
  const stripped = stripStringsAndComments(text);

  const sigMatch =
    /func\s+\w+\s*(?:<[^>]+>)?\s*\(([^)]*)\)\s*(async\s*)?(throws\s*)?(?:->\s*([^{]+))?\s*\{/.exec(
      text,
    );
  const paramSig = sigMatch ? sigMatch[1]!.replace(/\s+/g, '').replace(/['"]/g, '') : '';
  const returnType = sigMatch?.[4]?.trim() ?? null;
  const isAsync = !!sigMatch?.[2] || /\basync\b/.test(text);
  const declaresThrows = !!sigMatch?.[3];
  const isGenerator = false;

  const returnExprs = unique(
    [...stripped.matchAll(/\breturn\b([^\n]*)/g)].map((m) => (m[1] ?? '').trim() || '<void>'),
  );
  const explicitThrows = [...stripped.matchAll(/\bthrow\s+([A-Z][\w.]*(?:\([^)]*\))?|\w+)/g)].map(
    (m) => m[1]!.trim(),
  );
  const throws = unique([...(declaresThrows ? ['<declared>'] : []), ...explicitThrows]);

  const callSites = unique(
    [...stripped.matchAll(/\b([A-Za-z_][\w.]*)\s*\(/g)].map((m) => m[1]!.trim()),
  );
  const branchConditions = unique([
    ...[...stripped.matchAll(/\bif\s+([^{\n]+)\{/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bguard\s+([^{\n]+)\{/g)].map((m) => `guard:${m[1]!.trim()}`),
    ...[...stripped.matchAll(/\bwhile\s+([^{\n]+)\{/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bfor\s+([^{\n]+)\{/g)].map((m) => `for:${m[1]!.trim()}`),
    ...[...stripped.matchAll(/\bswitch\s+([^{\n]+)\{/g)].map((m) => `switch:${m[1]!.trim()}`),
  ]);

  const effects = new Set<EffectKind>();
  for (const p of SWIFT_EFFECT_PATTERNS) if (p.match.test(text)) effects.add(p.kind);

  const complexity =
    1 +
    branchConditions.length +
    (stripped.match(/\bcatch\b/g)?.length ?? 0) +
    (stripped.match(/\b&&\b|\b\|\|\b/g)?.length ?? 0);

  return {
    paramSig,
    returnType,
    isAsync,
    isGenerator,
    returnExprs,
    callSites,
    throws,
    branchConditions,
    effects,
    skeleton: structuralSkeleton(text),
    complexity,
  };
}

function structuralSkeleton(text: string): string {
  return text
    .replace(/\/\/\/?[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\b[A-Za-z_$][\w$]*\b/g, (m) => (SWIFT_KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();
}

function stripStringsAndComments(text: string): string {
  return text
    .replace(/\/\/\/?[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"])*"/g, '""');
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
