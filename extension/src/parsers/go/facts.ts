import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';

const GO_EFFECT_PATTERNS: Array<{ kind: EffectKind; match: RegExp }> = [
  { kind: 'network', match: /\bhttp\.(Get|Post|Put|Delete|NewRequest|Do)\s*\(/ },
  { kind: 'network', match: /\b(net\/http|net\.Dial)\b/ },
  { kind: 'fs', match: /\bos\.(Open|Create|Remove|Mkdir|ReadFile|WriteFile|Stat)\s*\(/ },
  { kind: 'fs', match: /\bio(?:util)?\.(ReadFile|WriteFile|ReadAll)\s*\(/ },
  { kind: 'env', match: /\bos\.Getenv\s*\(/ },
  { kind: 'env', match: /\bos\.Setenv\s*\(/ },
  { kind: 'console', match: /\bfmt\.(Print|Println|Printf|Errorf)\s*\(/ },
  { kind: 'console', match: /\blog\.(Print|Println|Printf|Fatal|Panic)\s*\(/ },
  { kind: 'env', match: /\bexec\.(Command|CommandContext)\s*\(/ },
];

const GO_KEYWORDS = new Set([
  'func',
  'return',
  'if',
  'else',
  'for',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'defer',
  'go',
  'chan',
  'select',
  'type',
  'struct',
  'interface',
  'map',
  'package',
  'import',
  'var',
  'const',
  'range',
  'fallthrough',
  'nil',
  'true',
  'false',
  'goto',
]);

export function extractGoFacts(text: string): FnFacts {
  const stripped = stripStringsAndComments(text);

  // Signature: `func (recv) Name(params) (returns) {`
  const sigMatch =
    /func\s+(?:\([^)]*\)\s+)?\w+\s*\(([^)]*)\)\s*(?:\(([^)]*)\)|([\w\[\]*.]+))?/m.exec(text);
  const paramSig = sigMatch ? sigMatch[1]!.replace(/\s+/g, '').replace(/['"]/g, '') : '';
  const returnType = sigMatch ? ((sigMatch[2] ?? sigMatch[3] ?? null)?.trim() ?? null) : null;

  // Go has no async; track goroutines via `go ...(...)` as "concurrent calls"
  const isAsync = /\bgo\s+\w/.test(stripped);
  const isGenerator = false;

  const returnExprs = unique(
    [...stripped.matchAll(/\breturn\b([^\n]*)/g)].map((m) => (m[1] ?? '').trim() || '<void>'),
  );
  // Go has no exceptions — use `panic(...)` + returned-error count as a proxy.
  const panics = [...stripped.matchAll(/\bpanic\s*\(([^)]*)\)/g)].map((m) => m[1]!.trim());
  const errorReturns = [...stripped.matchAll(/\breturn\s+[^,\n]+,\s*[^,\n]*err/g)].length;
  const throws = unique([
    ...panics,
    ...(errorReturns > 0 ? [`<err-returns:${errorReturns}>`] : []),
  ]);

  const callSites = unique(
    [...stripped.matchAll(/\b([A-Za-z_][\w.]*)\s*\(/g)].map((m) => m[1]!.trim()),
  );

  const branchConditions = unique([
    ...[...stripped.matchAll(/\bif\s+([^{\n]+)\{/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bfor\s+([^{\n]+)\{/g)].map((m) => `for:${m[1]!.trim()}`),
    ...[...stripped.matchAll(/\bswitch\s+([^{\n]+)\{/g)].map((m) => `switch:${m[1]!.trim()}`),
  ]);

  const effects = new Set<EffectKind>();
  for (const p of GO_EFFECT_PATTERNS) {
    if (p.match.test(text)) effects.add(p.kind);
  }

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
    .replace(/\b[A-Za-z_$][\w$]*\b/g, (m) => (GO_KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();
}

function stripStringsAndComments(text: string): string {
  return text
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/`[^`]*`/g, '""')
    .replace(/"(?:\\.|[^"])*"/g, '""');
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
