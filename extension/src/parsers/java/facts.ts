import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';
import { JVM_EFFECT_PATTERNS } from '../jvm/effect-patterns.js';

const JAVA_KEYWORDS = new Set([
  'abstract',
  'assert',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'double',
  'else',
  'enum',
  'extends',
  'final',
  'finally',
  'float',
  'for',
  'goto',
  'if',
  'implements',
  'import',
  'instanceof',
  'int',
  'interface',
  'long',
  'native',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'record',
  'return',
  'short',
  'static',
  'strictfp',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'void',
  'volatile',
  'while',
  'yield',
  'var',
  'sealed',
  'non-sealed',
  'permits',
]);

export function extractJavaFacts(text: string): FnFacts {
  const stripped = stripStringsAndComments(text);

  // Signature: capture `<generics>? <returnType> name(<params>) [throws...]`
  const sigMatch =
    /(?:(?:public|private|protected|static|final|abstract|synchronized|native|default|strictfp)\s+)*(?:<[^>]+>\s+)?([\w<>?,.\s\[\]]+?)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:throws\s+([\w.<>\s,]+))?\s*\{/.exec(
      text,
    );
  const returnType = sigMatch ? sigMatch[1]!.trim() : null;
  const paramSig = sigMatch ? sigMatch[3]!.replace(/\s+/g, '').replace(/['"]/g, '') : '';
  const declaredThrows = sigMatch?.[4]
    ? sigMatch[4]!
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const isAsync = false; // Java async is library-shaped (CompletableFuture); skip in v1
  const isGenerator = false;

  const returnExprs = unique(
    [...stripped.matchAll(/\breturn\b([^;]*)/g)].map((m) => (m[1] ?? '').trim() || '<void>'),
  );
  const explicitThrows = [...stripped.matchAll(/\bthrow\s+new\s+([A-Z]\w*)\s*\(/g)].map(
    (m) => m[1]!,
  );
  const throws = unique([...declaredThrows, ...explicitThrows]);

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
  for (const p of JVM_EFFECT_PATTERNS) {
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
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\b[A-Za-z_$][\w$]*\b/g, (m) => (JAVA_KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();
}

function stripStringsAndComments(text: string): string {
  return text
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"])*"/g, '""');
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
