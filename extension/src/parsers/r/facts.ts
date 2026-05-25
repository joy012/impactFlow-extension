import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';

const R_EFFECT_PATTERNS: Array<{ kind: EffectKind; match: RegExp }> = [
  { kind: 'network', match: /\b(httr|curl|RCurl)::|download\.file\s*\(/ },
  { kind: 'fs', match: /\b(read|write)\.(csv|table|json|rds|RDS)\s*\(/ },
  { kind: 'fs', match: /\bfile\.(remove|exists|create)\s*\(/ },
  { kind: 'env', match: /\bSys\.(getenv|setenv)\s*\(/ },
  { kind: 'env', match: /\bsystem\s*\(/ },
  { kind: 'console', match: /\b(print|cat|message|warning)\s*\(/ },
];

const R_KEYWORDS = new Set([
  'if',
  'else',
  'for',
  'while',
  'repeat',
  'function',
  'return',
  'next',
  'break',
  'TRUE',
  'FALSE',
  'NULL',
  'NA',
  'Inf',
  'NaN',
  'in',
]);

export function extractRFacts(text: string): FnFacts {
  const stripped = stripComments(text);

  const sigMatch = /function\s*\(([^)]*)\)/.exec(text);
  const paramSig = sigMatch ? sigMatch[1]!.replace(/\s+/g, '') : '';

  const isAsync = /\bfuture\s*\(|\bpromises::/.test(text);
  const isGenerator = false;

  const returnExprs = unique(
    [...stripped.matchAll(/\breturn\s*\(([^)]*)\)/g)].map((m) => m[1]!.trim() || '<void>'),
  );
  const throws = unique([...stripped.matchAll(/\bstop\s*\(([^)]*)\)/g)].map((m) => m[1]!.trim()));
  const callSites = unique(
    [...stripped.matchAll(/\b([A-Za-z_.][\w.:]*)\s*\(/g)].map((m) => m[1]!.trim()),
  );
  const branchConditions = unique([
    ...[...stripped.matchAll(/\bif\s*\(([^)]+)\)/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bwhile\s*\(([^)]+)\)/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bfor\s*\(([^)]+)\)/g)].map((m) => `for:${m[1]!.trim()}`),
  ]);

  const effects = new Set<EffectKind>();
  for (const p of R_EFFECT_PATTERNS) if (p.match.test(text)) effects.add(p.kind);

  const complexity = 1 + branchConditions.length + (stripped.match(/&&|\|\|/g)?.length ?? 0);

  return {
    paramSig,
    returnType: null,
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
    .replace(/\b[A-Za-z_.][\w.]*\b/g, (m) => (R_KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();
}

function stripComments(text: string): string {
  return text
    .replace(/#[^\n]*/g, '')
    .replace(/"(?:\\.|[^"])*"/g, '""')
    .replace(/'(?:\\.|[^'])*'/g, "''");
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
