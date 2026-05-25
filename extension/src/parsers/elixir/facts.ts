import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';

const ELIXIR_EFFECT_PATTERNS: Array<{ kind: EffectKind; match: RegExp }> = [
  { kind: 'network', match: /\b(HTTPoison|Tesla|Mojito|Finch|Req)\./ },
  { kind: 'fs', match: /\bFile\.(read|write|open|stream|cp|rm|mkdir)\b/ },
  { kind: 'env', match: /\bSystem\.(get_env|put_env|cmd)\b/ },
  { kind: 'console', match: /\bIO\.(puts|inspect|write)\s*\(?/ },
  { kind: 'console', match: /\bLogger\.(info|debug|warn|error)\b/ },
];

const ELIXIR_KEYWORDS = new Set([
  'def',
  'defp',
  'defmacro',
  'defmacrop',
  'defmodule',
  'defstruct',
  'defprotocol',
  'defimpl',
  'do',
  'end',
  'fn',
  'if',
  'unless',
  'else',
  'cond',
  'case',
  'when',
  'with',
  'for',
  'receive',
  'after',
  'try',
  'rescue',
  'catch',
  'raise',
  'throw',
  'true',
  'false',
  'nil',
  'and',
  'or',
  'not',
  'in',
  'use',
  'import',
  'alias',
  'require',
  'quote',
  'unquote',
]);

export function extractElixirFacts(text: string): FnFacts {
  const stripped = stripStringsAndComments(text);

  const sigMatch = /def(?:p|macro|macrop)?\s+[\w?!]+\s*(?:\(([^)]*)\))?/.exec(text);
  const paramSig = sigMatch ? (sigMatch[1] ?? '').replace(/\s+/g, '') : '';

  const isAsync = false;
  const isGenerator = false;

  const returnExprs: string[] = []; // Elixir has implicit returns — every expression's value is returned
  const throws = unique([
    ...[...stripped.matchAll(/\braise\s+([\w.]+|"[^"]*")/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bthrow\s+([\w.]+|"[^"]*")/g)].map((m) => m[1]!.trim()),
  ]);
  const callSites = unique(
    [...stripped.matchAll(/\b([A-Za-z_][\w.]*)\s*[({]/g)].map((m) => m[1]!.trim()),
  );
  const branchConditions = unique([
    ...[...stripped.matchAll(/\bif\s+([^\n]+?)\s+do\b/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bunless\s+([^\n]+?)\s+do\b/g)].map((m) => `unless:${m[1]!.trim()}`),
    ...[...stripped.matchAll(/\bcase\s+([^\n]+?)\s+do\b/g)].map((m) => `case:${m[1]!.trim()}`),
    ...[...stripped.matchAll(/\bcond\s+do\b/g)].map(() => 'cond:'),
  ]);

  const effects = new Set<EffectKind>();
  for (const p of ELIXIR_EFFECT_PATTERNS) if (p.match.test(text)) effects.add(p.kind);

  const complexity =
    1 +
    branchConditions.length +
    (stripped.match(/\b->\b/g)?.length ?? 0) + // case clauses
    (stripped.match(/\band\b|\bor\b/g)?.length ?? 0);

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
    .replace(/\b[A-Za-z_][\w?!]*\b/g, (m) => (ELIXIR_KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();
}

function stripStringsAndComments(text: string): string {
  return text
    .replace(/#[^\n]*/g, '')
    .replace(/"""[\s\S]*?"""/g, '""')
    .replace(/"(?:\\.|[^"])*"/g, '""');
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
