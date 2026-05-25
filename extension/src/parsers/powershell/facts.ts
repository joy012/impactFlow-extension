import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';

const PS_EFFECT_PATTERNS: Array<{ kind: EffectKind; match: RegExp }> = [
  { kind: 'network', match: /\bInvoke-(WebRequest|RestMethod)\b/i },
  { kind: 'fs', match: /\b(Get-Content|Set-Content|Out-File|Remove-Item|New-Item|Test-Path)\b/i },
  { kind: 'env', match: /\$env:|Get-ChildItem\s+env:/i },
  { kind: 'env', match: /\bStart-Process\b|\bInvoke-Expression\b/i },
  { kind: 'console', match: /\bWrite-(Host|Output|Verbose|Warning|Error)\b/i },
];

const PS_KEYWORDS = new Set([
  'begin',
  'break',
  'catch',
  'class',
  'continue',
  'data',
  'define',
  'do',
  'dynamicparam',
  'else',
  'elseif',
  'end',
  'exit',
  'filter',
  'finally',
  'for',
  'foreach',
  'from',
  'function',
  'global',
  'hidden',
  'if',
  'in',
  'local',
  'param',
  'private',
  'process',
  'return',
  'script',
  'static',
  'switch',
  'throw',
  'trap',
  'try',
  'until',
  'using',
  'var',
  'while',
  'workflow',
]);

export function extractPowershellFacts(text: string): FnFacts {
  const stripped = stripComments(text);

  const sigMatch =
    /function\s+(?:(?:global|script|local|private):)?(\w[\w-]*)\s*\{[\s\S]*?param\s*\(([^)]*)\)/i.exec(
      text,
    );
  const paramSig = sigMatch ? (sigMatch[2] ?? '').replace(/\s+/g, '') : '';

  const isAsync = /\bStart-Job\b|\bStart-ThreadJob\b/i.test(text);
  const isGenerator = false;

  const returnExprs = unique(
    [...stripped.matchAll(/\breturn\b([^\n]*)/g)].map((m) => (m[1] ?? '').trim() || '<void>'),
  );
  const throws = unique([...stripped.matchAll(/\bthrow\s+([^\n;]*)/g)].map((m) => m[1]!.trim()));
  const callSites = unique(
    [...stripped.matchAll(/\b([A-Z][\w-]+-\w+)\b/g)].map((m) => m[1]!.trim()),
  );
  const branchConditions = unique([
    ...[...stripped.matchAll(/\bif\s*\(([^)]+)\)/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bwhile\s*\(([^)]+)\)/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bforeach\s*\(([^)]+)\)/g)].map((m) => `for:${m[1]!.trim()}`),
    ...[...stripped.matchAll(/\bswitch\s*\(([^)]+)\)/g)].map((m) => `switch:${m[1]!.trim()}`),
  ]);

  const effects = new Set<EffectKind>();
  for (const p of PS_EFFECT_PATTERNS) if (p.match.test(text)) effects.add(p.kind);

  const complexity =
    1 +
    branchConditions.length +
    (stripped.match(/\bcatch\b/g)?.length ?? 0) +
    (stripped.match(/-and|-or|-not/g)?.length ?? 0);

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
    .replace(/#[^\n]*|<#[\s\S]*?#>/g, '')
    .replace(/\b[A-Za-z_][\w-]*\b/g, (m) => (PS_KEYWORDS.has(m.toLowerCase()) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();
}

function stripComments(text: string): string {
  return text
    .replace(/#[^\n]*/g, '')
    .replace(/<#[\s\S]*?#>/g, '')
    .replace(/"(?:`.|[^"])*"/g, '""')
    .replace(/'(?:[^'])*'/g, "''");
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
