import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';

const PHP_EFFECT_PATTERNS: Array<{ kind: EffectKind; match: RegExp }> = [
  { kind: 'network', match: /\b(curl_\w+)\s*\(/ },
  { kind: 'network', match: /\b(Http|GuzzleHttp|HttpClient)\\Client/ },
  {
    kind: 'fs',
    match:
      /\b(fopen|fwrite|fread|fclose|file_get_contents|file_put_contents|unlink|mkdir|rmdir|is_file|file_exists)\s*\(/,
  },
  { kind: 'env', match: /\$_(ENV|SERVER|GET|POST|REQUEST|COOKIE|SESSION)\b/ },
  { kind: 'env', match: /\b(getenv|putenv|exec|shell_exec|system|passthru|proc_open)\s*\(/ },
  { kind: 'console', match: /\b(echo|print|var_dump|print_r|error_log)\b/ },
  { kind: 'fs', match: /\b(PDO|mysqli|mysql_\w+)\b/ },
];

const PHP_KEYWORDS = new Set([
  'abstract',
  'and',
  'array',
  'as',
  'break',
  'callable',
  'case',
  'catch',
  'class',
  'clone',
  'const',
  'continue',
  'declare',
  'default',
  'do',
  'echo',
  'else',
  'elseif',
  'empty',
  'enddeclare',
  'endfor',
  'endforeach',
  'endif',
  'endswitch',
  'endwhile',
  'enum',
  'extends',
  'final',
  'finally',
  'fn',
  'for',
  'foreach',
  'function',
  'global',
  'goto',
  'if',
  'implements',
  'include',
  'include_once',
  'instanceof',
  'insteadof',
  'interface',
  'isset',
  'list',
  'match',
  'namespace',
  'new',
  'or',
  'print',
  'private',
  'protected',
  'public',
  'readonly',
  'require',
  'require_once',
  'return',
  'static',
  'switch',
  'throw',
  'trait',
  'try',
  'unset',
  'use',
  'var',
  'while',
  'xor',
  'yield',
  'null',
  'true',
  'false',
  'self',
  'parent',
  'this',
]);

export function extractPhpFacts(text: string): FnFacts {
  const stripped = stripStringsAndComments(text);

  const sigMatch = /function\s+\w+\s*\(([^)]*)\)(?:\s*:\s*([\w\\?|]+))?/.exec(text);
  const paramSig = sigMatch ? sigMatch[1]!.replace(/\s+/g, '').replace(/['"]/g, '') : '';
  const returnType = sigMatch?.[2]?.trim() ?? null;

  const isAsync = false;
  const isGenerator = /\byield\b/.test(stripped);

  const returnExprs = unique(
    [...stripped.matchAll(/\breturn\b([^;]*)/g)].map((m) => (m[1] ?? '').trim() || '<void>'),
  );
  const throws = unique(
    [...stripped.matchAll(/\bthrow\s+new\s+([A-Z]\w*)\s*\(/g)].map((m) => m[1]!),
  );
  const callSites = unique(
    [...stripped.matchAll(/\b([A-Za-z_][\w\\]*)\s*\(/g)].map((m) => m[1]!.trim()),
  );
  const branchConditions = unique([
    ...[...stripped.matchAll(/\bif\s*\(([^)]+)\)/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bwhile\s*\(([^)]+)\)/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bfor(?:each)?\s*\(([^)]+)\)/g)].map((m) => `for:${m[1]!.trim()}`),
    ...[...stripped.matchAll(/\bswitch\s*\(([^)]+)\)/g)].map((m) => `switch:${m[1]!.trim()}`),
  ]);

  const effects = new Set<EffectKind>();
  for (const p of PHP_EFFECT_PATTERNS) {
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
    .replace(/#[^\n]*|\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\b[A-Za-z_$][\w$]*\b/g, (m) => (PHP_KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();
}

function stripStringsAndComments(text: string): string {
  return text
    .replace(/#[^\n]*|\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'(?:\\.|[^'])*'/g, "''")
    .replace(/"(?:\\.|[^"])*"/g, '""');
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
