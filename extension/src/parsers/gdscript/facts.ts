import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';

const GDSCRIPT_EFFECT_PATTERNS: Array<{ kind: EffectKind; match: RegExp }> = [
  { kind: 'network', match: /\bHTTPRequest\b|\bHTTPClient\b/ },
  { kind: 'fs', match: /\bFileAccess\b|\bDirAccess\b/ },
  { kind: 'env', match: /\bOS\.(get_environment|execute)\b/ },
  { kind: 'console', match: /\b(print|printerr|push_warning|push_error)\s*\(/ },
  // Godot-specific scene-tree mutation
  { kind: 'mutation', match: /\bemit_signal\s*\(|\.queue_free\s*\(/ },
];

const GDSCRIPT_KEYWORDS = new Set([
  'and',
  'or',
  'not',
  'in',
  'is',
  'as',
  'if',
  'elif',
  'else',
  'for',
  'while',
  'break',
  'continue',
  'pass',
  'return',
  'match',
  'when',
  'class',
  'class_name',
  'extends',
  'func',
  'static',
  'var',
  'const',
  'enum',
  'signal',
  'true',
  'false',
  'null',
  'self',
  'super',
  'tool',
  'export',
  'onready',
]);

export function extractGdscriptFacts(text: string): FnFacts {
  const stripped = stripComments(text);

  const sigMatch = /func\s+\w+\s*\(([^)]*)\)\s*(?:->\s*(\w+))?/.exec(text);
  const paramSig = sigMatch ? (sigMatch[1] ?? '').replace(/\s+/g, '') : '';
  const returnType = sigMatch?.[2]?.trim() ?? null;

  const isAsync = /\bawait\b/.test(stripped);
  const isGenerator = false;

  const returnExprs = unique(
    [...stripped.matchAll(/\breturn\b([^\n]*)/g)].map((m) => (m[1] ?? '').trim() || '<void>'),
  );
  const throws = unique([...stripped.matchAll(/\bassert\s*\(([^)]*)\)/g)].map((m) => m[1]!.trim()));
  const callSites = unique(
    [...stripped.matchAll(/\b([A-Za-z_][\w.]*)\s*\(/g)].map((m) => m[1]!.trim()),
  );
  const branchConditions = unique([
    ...[...stripped.matchAll(/\b(?:if|elif|while)\s+([^:\n]+):/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bfor\s+([^:\n]+):/g)].map((m) => `for:${m[1]!.trim()}`),
  ]);

  const effects = new Set<EffectKind>();
  for (const p of GDSCRIPT_EFFECT_PATTERNS) if (p.match.test(text)) effects.add(p.kind);

  const complexity = 1 + branchConditions.length + (stripped.match(/\band\b|\bor\b/g)?.length ?? 0);

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
    .replace(/\b[A-Za-z_][\w]*\b/g, (m) => (GDSCRIPT_KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();
}

function stripComments(text: string): string {
  return text.replace(/#[^\n]*/g, '').replace(/"(?:\\.|[^"])*"/g, '""');
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
