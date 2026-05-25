import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';

const DART_EFFECT_PATTERNS: Array<{ kind: EffectKind; match: RegExp }> = [
  { kind: 'network', match: /\b(http\.\w+|Dio\(\)|dio\.\w+)\s*\(/ },
  { kind: 'network', match: /\bHttpClient\(\)/ },
  { kind: 'fs', match: /\bFile\s*\(/ },
  { kind: 'fs', match: /\bDirectory\s*\(/ },
  { kind: 'fs', match: /\bProcess\.run\s*\(/ },
  { kind: 'env', match: /\bPlatform\.environment\b/ },
  { kind: 'console', match: /\bprint\s*\(/ },
  { kind: 'console', match: /\bdeveloper\.log\s*\(/ },
  // Flutter-specific side-effect surface: state mutation triggers rebuilds.
  { kind: 'mutation', match: /\bsetState\s*\(/ },
];

const DART_KEYWORDS = new Set([
  'void',
  'var',
  'final',
  'const',
  'late',
  'dynamic',
  'true',
  'false',
  'null',
  'this',
  'super',
  'new',
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
  'on',
  'catch',
  'finally',
  'class',
  'abstract',
  'extends',
  'implements',
  'mixin',
  'with',
  'factory',
  'get',
  'set',
  'operator',
  'async',
  'await',
  'sync',
  'yield',
  'import',
  'export',
  'library',
  'part',
  'as',
  'show',
  'hide',
  'deferred',
  'typedef',
  'enum',
]);

export function extractDartFacts(text: string): FnFacts {
  const stripped = stripStringsAndComments(text);

  const sigMatch = /(\w+)\s*\(([^)]*)\)\s*(?:async\*?|sync\*)?\s*(\{|=>)/m.exec(text);
  const paramSig = sigMatch ? sigMatch[2]!.replace(/\s+/g, '').replace(/['"]/g, '') : '';

  // Return type — best-effort: token before the function name.
  const retMatch = /([\w<>?,.\s\[\]]+?)\s+\w+\s*\([^)]*\)\s*(?:async\*?|sync\*)?\s*(?:\{|=>)/m.exec(
    text,
  );
  const returnType = retMatch ? retMatch[1]!.trim() : null;

  const isAsync = /\basync\b/.test(stripped);
  const isGenerator = /\b(?:sync\*|async\*)\b/.test(stripped) || /\byield\b/.test(stripped);

  const returnExprs = unique(
    [...stripped.matchAll(/\breturn\b([^;\n]*)/g)].map((m) => (m[1] ?? '').trim() || '<void>'),
  );
  const throws = unique(
    [...stripped.matchAll(/\bthrow\s+([A-Z]\w*(?:\([^)]*\))?|\w+)/g)].map((m) => m[1]!.trim()),
  );
  const callSites = unique(
    [...stripped.matchAll(/\b([A-Za-z_][\w.]*)\s*\(/g)].map((m) => m[1]!.trim()),
  );
  const branchConditions = unique([
    ...[...stripped.matchAll(/\bif\s*\(([^)]+)\)/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bwhile\s*\(([^)]+)\)/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bfor\s*\(([^)]+)\)/g)].map((m) => `for:${m[1]!.trim()}`),
    ...[...stripped.matchAll(/\bswitch\s*\(([^)]+)\)/g)].map((m) => `switch:${m[1]!.trim()}`),
  ]);

  const effects = new Set<EffectKind>();
  for (const p of DART_EFFECT_PATTERNS) {
    if (p.match.test(text)) effects.add(p.kind);
  }

  const complexity =
    1 +
    branchConditions.length +
    (stripped.match(/\bcase\b/g)?.length ?? 0) +
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
    .replace(/\b[A-Za-z_$][\w$]*\b/g, (m) => (DART_KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();
}

function stripStringsAndComments(text: string): string {
  return text
    .replace(/\/\/\/?[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'(?:\\.|[^'])*'/g, "''")
    .replace(/"(?:\\.|[^"])*"/g, '""');
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
