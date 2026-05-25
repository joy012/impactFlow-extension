import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';

const OBJC_EFFECT_PATTERNS: Array<{ kind: EffectKind; match: RegExp }> = [
  { kind: 'network', match: /\bNSURLSession\b|\bNSURLConnection\b/ },
  { kind: 'fs', match: /\bNSFileManager\b|\bNSFileHandle\b/ },
  { kind: 'env', match: /\bNSProcessInfo\b/ },
  { kind: 'console', match: /\bNSLog\s*\(/ },
];

const OBJC_KEYWORDS = new Set([
  'auto',
  'break',
  'case',
  'char',
  'const',
  'continue',
  'default',
  'do',
  'double',
  'else',
  'enum',
  'extern',
  'float',
  'for',
  'goto',
  'if',
  'int',
  'long',
  'register',
  'return',
  'short',
  'signed',
  'sizeof',
  'static',
  'struct',
  'switch',
  'typedef',
  'union',
  'unsigned',
  'void',
  'volatile',
  'while',
  'id',
  'self',
  'super',
  'nil',
  'NULL',
  'YES',
  'NO',
  'IBOutlet',
  'IBAction',
  'in',
  'out',
  'inout',
  'bycopy',
  'byref',
  'oneway',
  'instancetype',
  'BOOL',
  'NSInteger',
  'NSUInteger',
  'CGFloat',
]);

export function extractObjcFacts(text: string): FnFacts {
  const stripped = stripStringsAndComments(text);

  // Capture the param list as the colon-arg pairs after the method name.
  const sigMatch =
    /[-+]\s*\(([^)]+)\)\s*([A-Za-z_]\w*)((?:\s*:\s*\([^)]+\)\s*\w+(?:\s+\w+:)?)*)/m.exec(text);
  const returnType = sigMatch ? sigMatch[1]!.trim() : null;
  const paramSig = sigMatch ? (sigMatch[3] ?? '').replace(/\s+/g, '').replace(/['"]/g, '') : '';
  const isAsync = false;
  const isGenerator = false;

  const returnExprs = unique(
    [...stripped.matchAll(/\breturn\b([^;]*)/g)].map((m) => (m[1] ?? '').trim() || '<void>'),
  );
  const throws = unique([
    ...[...stripped.matchAll(/\[NSException\s+raise:\s*@"([^"]+)"/g)].map((m) => m[1]!),
    ...[...stripped.matchAll(/@throw\s+\[?([\w.]+)/g)].map((m) => m[1]!),
  ]);
  const callSites = unique(
    [...stripped.matchAll(/\[\s*[\w.\s]+?\s+([A-Za-z_]\w*)/g)].map((m) => m[1]!.trim()),
  );
  const branchConditions = unique([
    ...[...stripped.matchAll(/\bif\s*\(([^)]+)\)/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bwhile\s*\(([^)]+)\)/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bfor\s*\(([^)]+)\)/g)].map((m) => `for:${m[1]!.trim()}`),
    ...[...stripped.matchAll(/\bswitch\s*\(([^)]+)\)/g)].map((m) => `switch:${m[1]!.trim()}`),
  ]);

  const effects = new Set<EffectKind>();
  for (const p of OBJC_EFFECT_PATTERNS) if (p.match.test(text)) effects.add(p.kind);

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
    .replace(/\b[A-Za-z_$][\w$]*\b/g, (m) => (OBJC_KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();
}

function stripStringsAndComments(text: string): string {
  return text
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@"(?:\\.|[^"])*"/g, '@""')
    .replace(/"(?:\\.|[^"])*"/g, '""');
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
