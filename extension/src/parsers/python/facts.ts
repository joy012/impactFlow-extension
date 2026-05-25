/**
 * Python FnFacts extractor — regex over the function text.
 * Same interface as ts-morph extractFacts; downstream detectors are language-agnostic.
 */

import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';

const PY_EFFECT_PATTERNS: Array<{ kind: EffectKind; match: RegExp }> = [
  // network
  { kind: 'network', match: /\b(requests|urllib|httpx|aiohttp)\.[a-z_]+\s*\(/ },
  { kind: 'network', match: /\bopen\s*\(\s*['"]https?:/i },
  // fs
  { kind: 'fs', match: /\bopen\s*\(/ },
  { kind: 'fs', match: /\b(os\.(remove|unlink|rmdir|makedirs|mkdir))\s*\(/ },
  { kind: 'fs', match: /\b(pathlib\.Path|Path)\(.*\)\.(write|read|unlink|mkdir)/ },
  { kind: 'fs', match: /\bshutil\.[a-z_]+\s*\(/ },
  // env / process
  { kind: 'env', match: /\bos\.environ\b/ },
  { kind: 'env', match: /\bos\.getenv\s*\(/ },
  { kind: 'env', match: /\b(subprocess|os\.system)\s*[(.]/ },
  // dom — Python has no DOM, but we leave the slot
  // console / logging
  { kind: 'console', match: /\bprint\s*\(/ },
  { kind: 'console', match: /\blogging\.[a-z_]+\s*\(/ },
  // globals / mutation
  { kind: 'globals', match: /\bglobal\s+\w+/ },
  { kind: 'mutation', match: /\bsetattr\s*\(/ },
];

const PY_KEYWORDS = new Set([
  'def',
  'return',
  'if',
  'elif',
  'else',
  'for',
  'while',
  'try',
  'except',
  'finally',
  'raise',
  'in',
  'not',
  'and',
  'or',
  'is',
  'None',
  'True',
  'False',
  'class',
  'lambda',
  'yield',
  'async',
  'await',
  'with',
  'as',
  'import',
  'from',
  'global',
  'nonlocal',
  'pass',
  'break',
  'continue',
  'match',
  'case',
  'self',
  'cls',
]);

export function extractPythonFacts(text: string): FnFacts {
  const stripped = stripStringsAndComments(text);

  const sigMatch = /def\s+\w+\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?:/.exec(text);
  const paramSig = sigMatch ? sigMatch[1]!.replace(/\s+/g, '').replace(/['"]/g, '') : '';
  const returnType = sigMatch?.[2]?.trim() ?? null;
  const isAsync = /^\s*async\s+def\b/m.test(text);
  const isGenerator = /\byield\b/.test(stripped);

  const returnExprs = unique(
    [...stripped.matchAll(/\breturn\b([^\n#]*)/g)].map((m) => (m[1] ?? '').trim() || '<void>'),
  );
  const throws = unique(
    [...stripped.matchAll(/\braise\s+([A-Z]\w*\s*\([^)]*\)|\w+)/g)].map((m) => m[1]!.trim()),
  );
  const callSites = unique([
    ...[...stripped.matchAll(/\b([A-Za-z_][\w.]*)\s*\(/g)].map((m) => m[1]!.trim()),
  ]);
  const branchConditions = unique([
    ...[...stripped.matchAll(/\b(?:if|elif|while)\s+([^:\n]+):/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bfor\s+([^:\n]+):/g)].map((m) => `for:${m[1]!.trim()}`),
  ]);

  const effects = new Set<EffectKind>();
  for (const p of PY_EFFECT_PATTERNS) {
    if (p.match.test(text)) effects.add(p.kind);
  }

  const complexity =
    1 +
    branchConditions.length +
    (stripped.match(/\bexcept\b/g)?.length ?? 0) +
    (stripped.match(/\band\b|\bor\b/g)?.length ?? 0);

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
    .replace(/#[^\n]*/g, '')
    .replace(/'''[\s\S]*?'''/g, '')
    .replace(/"""[\s\S]*?"""/g, '')
    .replace(/\b[A-Za-z_$][\w$]*\b/g, (m) => (PY_KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();
}

function stripStringsAndComments(text: string): string {
  return text
    .replace(/#[^\n]*/g, '')
    .replace(/'''[\s\S]*?'''/g, '""')
    .replace(/"""[\s\S]*?"""/g, '""')
    .replace(/'(?:\\.|[^'])*'/g, '""')
    .replace(/"(?:\\.|[^"])*"/g, '""');
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
