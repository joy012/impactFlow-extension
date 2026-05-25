import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';

const RUST_EFFECT_PATTERNS: Array<{ kind: EffectKind; match: RegExp }> = [
  { kind: 'fs', match: /\bstd::fs::|\bFile::(open|create)\b/ },
  { kind: 'fs', match: /\b(tokio::fs|async_std::fs)::/ },
  { kind: 'network', match: /\bstd::net::|\bTcpStream\b|\bUdpSocket\b/ },
  { kind: 'network', match: /\b(reqwest|hyper|isahc)::/ },
  { kind: 'env', match: /\bstd::env::/ },
  { kind: 'env', match: /\bstd::process::Command\b/ },
  { kind: 'console', match: /\b(println|eprintln|dbg|print|eprint)\s*!/ },
  { kind: 'console', match: /\b(log|tracing|slog)::(info|warn|error|debug|trace)\s*!/ },
];

const RUST_KEYWORDS = new Set([
  'as',
  'break',
  'const',
  'continue',
  'crate',
  'else',
  'enum',
  'extern',
  'false',
  'fn',
  'for',
  'if',
  'impl',
  'in',
  'let',
  'loop',
  'match',
  'mod',
  'move',
  'mut',
  'pub',
  'ref',
  'return',
  'self',
  'Self',
  'static',
  'struct',
  'super',
  'trait',
  'true',
  'type',
  'unsafe',
  'use',
  'where',
  'while',
  'async',
  'await',
  'dyn',
  'box',
  'macro',
]);

export function extractRustFacts(text: string): FnFacts {
  const stripped = stripStringsAndComments(text);

  const sigMatch =
    /(?:(?:pub(?:\([^)]+\))?|async|const|unsafe|extern(?:\s+"[^"]+")?)\s+)*fn\s+\w+\s*(?:<[^>]+>)?\s*\(([^)]*)\)\s*(?:->\s*([^{]+?))?\s*(?:where\s+[^{]+)?\s*\{/.exec(
      text,
    );
  const paramSig = sigMatch ? sigMatch[1]!.replace(/\s+/g, '').replace(/['"]/g, '') : '';
  const returnType = sigMatch?.[2]?.trim() ?? null;

  const isAsync = /\basync\s+fn\b/.test(text);
  const isGenerator = false;

  const returnExprs = unique(
    [...stripped.matchAll(/\breturn\b([^;\n]*)/g)].map((m) => (m[1] ?? '').trim() || '<void>'),
  );
  // Throws-proxy: panic! count + Result<_,E> error variant
  const panics = [...stripped.matchAll(/\bpanic\s*!/g)].map(() => 'panic!');
  const errReturns = returnType?.includes('Result<') ? ['<Result>'] : [];
  const throws = unique([...panics, ...errReturns]);

  const callSites = unique(
    [...stripped.matchAll(/\b([A-Za-z_][\w:]*)\s*(?:::<[^>]+>)?\s*\(/g)].map((m) => m[1]!.trim()),
  );

  const branchConditions = unique([
    ...[...stripped.matchAll(/\bif\s+([^{\n]+)\{/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bwhile\s+([^{\n]+)\{/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bfor\s+([^{\n]+)\{/g)].map((m) => `for:${m[1]!.trim()}`),
    ...[...stripped.matchAll(/\bmatch\s+([^{\n]+)\{/g)].map((m) => `match:${m[1]!.trim()}`),
  ]);

  const effects = new Set<EffectKind>();
  for (const p of RUST_EFFECT_PATTERNS) {
    if (p.match.test(text)) effects.add(p.kind);
  }
  if (/\bunsafe\s*\{/.test(text)) effects.add('mutation');

  const complexity =
    1 +
    branchConditions.length +
    (stripped.match(/\b=>\b/g)?.length ?? 0) +
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
    .replace(/\b[A-Za-z_$][\w$]*\b/g, (m) => (RUST_KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();
}

function stripStringsAndComments(text: string): string {
  return text
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/r?"(?:\\.|[^"])*"/g, '""');
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
