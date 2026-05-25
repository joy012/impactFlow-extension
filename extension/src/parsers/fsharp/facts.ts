import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';

const FSHARP_EFFECT_PATTERNS: Array<{ kind: EffectKind; match: RegExp }> = [
  { kind: 'network', match: /\bHttpClient\b|\bWebRequest\b/ },
  { kind: 'fs', match: /\bSystem\.IO\.|File\.|Directory\./ },
  { kind: 'env', match: /\bSystem\.Environment\b/ },
  { kind: 'console', match: /\b(printfn|printf|eprintfn|eprintf)\b/ },
  { kind: 'console', match: /\bConsole\.(Write|WriteLine)\b/ },
];

const FSHARP_KEYWORDS = new Set([
  'and',
  'as',
  'assert',
  'base',
  'begin',
  'class',
  'default',
  'delegate',
  'do',
  'done',
  'downcast',
  'downto',
  'elif',
  'else',
  'end',
  'exception',
  'extern',
  'false',
  'finally',
  'fixed',
  'for',
  'fun',
  'function',
  'global',
  'if',
  'in',
  'inherit',
  'inline',
  'interface',
  'internal',
  'lazy',
  'let',
  'match',
  'member',
  'module',
  'mutable',
  'namespace',
  'new',
  'null',
  'of',
  'open',
  'or',
  'override',
  'private',
  'public',
  'rec',
  'return',
  'select',
  'static',
  'struct',
  'then',
  'to',
  'true',
  'try',
  'type',
  'upcast',
  'use',
  'val',
  'void',
  'when',
  'while',
  'with',
  'yield',
  'async',
  'task',
]);

export function extractFsharpFacts(text: string): FnFacts {
  const stripped = stripComments(text);

  const sigMatch = /let\s+(?:rec\s+)?[\w']+\s*(?:\(([^)]*)\))?/.exec(text);
  const paramSig = sigMatch ? (sigMatch[1] ?? '').replace(/\s+/g, '') : '';

  const isAsync = /\basync\s*\{/.test(text) || /\btask\s*\{/.test(text);
  const isGenerator = /\byield\b/.test(stripped);

  const returnExprs: string[] = []; // implicit return in F#
  const throws = unique(
    [...stripped.matchAll(/\braise\s+\(?([\w.]+(?:\([^)]*\))?)/g)].map((m) => m[1]!.trim()),
  );
  const callSites = unique(
    [...stripped.matchAll(/\b([A-Za-z_][\w.]*)\s+[\w(]/g)].map((m) => m[1]!.trim()),
  );
  const branchConditions = unique([
    ...[...stripped.matchAll(/\bif\s+([^\n]+?)\s+then\b/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bmatch\s+([^\n]+?)\s+with\b/g)].map((m) => `match:${m[1]!.trim()}`),
    ...[...stripped.matchAll(/\bwhile\s+([^\n]+?)\s+do\b/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bfor\s+([^\n]+?)\s+do\b/g)].map((m) => `for:${m[1]!.trim()}`),
  ]);

  const effects = new Set<EffectKind>();
  for (const p of FSHARP_EFFECT_PATTERNS) if (p.match.test(text)) effects.add(p.kind);

  const complexity = 1 + branchConditions.length + (stripped.match(/\b->\b/g)?.length ?? 0);

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
    .replace(/\/\/[^\n]*|\(\*[\s\S]*?\*\)/g, '')
    .replace(/\b[A-Za-z_'][\w']*\b/g, (m) => (FSHARP_KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();
}

function stripComments(text: string): string {
  return text
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\(\*[\s\S]*?\*\)/g, '')
    .replace(/"(?:\\.|[^"])*"/g, '""');
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
