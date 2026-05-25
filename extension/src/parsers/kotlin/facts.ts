import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';
import { JVM_EFFECT_PATTERNS } from '../jvm/effect-patterns.js';

const KOTLIN_KEYWORDS = new Set([
  'fun',
  'val',
  'var',
  'class',
  'interface',
  'object',
  'data',
  'sealed',
  'enum',
  'annotation',
  'companion',
  'init',
  'constructor',
  'open',
  'final',
  'abstract',
  'override',
  'inline',
  'external',
  'operator',
  'infix',
  'suspend',
  'tailrec',
  'public',
  'private',
  'protected',
  'internal',
  'return',
  'if',
  'else',
  'when',
  'for',
  'while',
  'do',
  'try',
  'catch',
  'finally',
  'throw',
  'in',
  'is',
  'as',
  'by',
  'this',
  'super',
  'null',
  'true',
  'false',
  'package',
  'import',
  'typealias',
  'where',
  'lateinit',
]);

export function extractKotlinFacts(text: string): FnFacts {
  const stripped = stripStringsAndComments(text);

  // fun [<generics>] [Receiver.]name(params)[ : ReturnType] {
  const sigMatch =
    /fun\s+(?:<[^>]+>\s+)?(?:[\w<>?,.\s\[\]]+?\.)?[A-Za-z_]\w*\s*\(([^)]*)\)(?:\s*:\s*([\w<>?,.\s\[\]]+?))?\s*\{/.exec(
      text,
    );
  const paramSig = sigMatch ? sigMatch[1]!.replace(/\s+/g, '').replace(/['"]/g, '') : '';
  const returnType = sigMatch?.[2]?.trim() ?? null;

  const isAsync = /\bsuspend\s+fun\b/.test(text) || /\basync\s*\{/.test(stripped);
  const isGenerator = /\byield\b/.test(stripped);

  const returnExprs = unique(
    [...stripped.matchAll(/\breturn\b([^\n]*)/g)].map((m) => (m[1] ?? '').trim() || '<void>'),
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
    ...[...stripped.matchAll(/\bwhen\s*\(([^)]+)\)/g)].map((m) => `when:${m[1]!.trim()}`),
  ]);

  const effects = new Set<EffectKind>();
  for (const p of JVM_EFFECT_PATTERNS) {
    if (p.match.test(text)) effects.add(p.kind);
  }

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
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\b[A-Za-z_$][\w$]*\b/g, (m) => (KOTLIN_KEYWORDS.has(m) ? m : '_'))
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
