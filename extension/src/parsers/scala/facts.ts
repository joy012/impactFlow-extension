import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';
import { JVM_EFFECT_PATTERNS } from '../jvm/effect-patterns.js';

const SCALA_KEYWORDS = new Set([
  'abstract',
  'case',
  'catch',
  'class',
  'def',
  'do',
  'else',
  'enum',
  'extends',
  'export',
  'false',
  'final',
  'finally',
  'for',
  'forSome',
  'given',
  'if',
  'implicit',
  'import',
  'inline',
  'lazy',
  'match',
  'new',
  'null',
  'object',
  'opaque',
  'override',
  'package',
  'private',
  'protected',
  'return',
  'sealed',
  'super',
  'then',
  'this',
  'throw',
  'trait',
  'transparent',
  'true',
  'try',
  'type',
  'using',
  'val',
  'var',
  'while',
  'with',
  'yield',
]);

export function extractScalaFacts(text: string): FnFacts {
  const stripped = stripStringsAndComments(text);

  const sigMatch = /def\s+\w+\s*(?:\[[^\]]+\])?\s*(?:\(([^)]*)\))?\s*(?::\s*([^={]+?))?\s*=/.exec(
    text,
  );
  const paramSig = sigMatch ? (sigMatch[1] ?? '').replace(/\s+/g, '').replace(/['"]/g, '') : '';
  const returnType = sigMatch?.[2]?.trim() ?? null;

  const isAsync = /\bFuture\[/.test(text) || /\bIO\[/.test(text);
  const isGenerator = false;

  const returnExprs = unique(
    [...stripped.matchAll(/\breturn\b([^\n]*)/g)].map((m) => (m[1] ?? '').trim() || '<void>'),
  );
  const throws = unique([...stripped.matchAll(/\bthrow\s+new\s+([A-Z]\w*)/g)].map((m) => m[1]!));
  const callSites = unique(
    [...stripped.matchAll(/\b([A-Za-z_][\w.]*)\s*\(/g)].map((m) => m[1]!.trim()),
  );
  const branchConditions = unique([
    ...[...stripped.matchAll(/\bif\s*\(([^)]+)\)/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bwhile\s*\(([^)]+)\)/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bfor\s*\(([^)]+)\)/g)].map((m) => `for:${m[1]!.trim()}`),
    ...[...stripped.matchAll(/\bmatch\b\s*\{/g)].map(() => 'match:'),
  ]);

  const effects = new Set<EffectKind>();
  for (const p of JVM_EFFECT_PATTERNS) if (p.match.test(text)) effects.add(p.kind);

  const complexity =
    1 +
    branchConditions.length +
    (stripped.match(/\bcase\b/g)?.length ?? 0) +
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
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\b[A-Za-z_$][\w$]*\b/g, (m) => (SCALA_KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();
}

function stripStringsAndComments(text: string): string {
  return text
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"""[\s\S]*?"""/g, '""')
    .replace(/"(?:\\.|[^"])*"/g, '""');
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
