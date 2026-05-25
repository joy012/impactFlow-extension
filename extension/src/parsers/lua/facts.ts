import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';

const LUA_EFFECT_PATTERNS: Array<{ kind: EffectKind; match: RegExp }> = [
  { kind: 'fs', match: /\bio\.(open|read|write|lines|close)\b/ },
  { kind: 'env', match: /\bos\.(getenv|setenv|execute|exit|date|time)\b/ },
  { kind: 'console', match: /\b(print|io\.write)\s*\(/ },
  // Roblox conventions
  { kind: 'network', match: /\bHttpService:GetAsync\b|\bHttpService:PostAsync\b/ },
];

const LUA_KEYWORDS = new Set([
  'and',
  'break',
  'do',
  'else',
  'elseif',
  'end',
  'false',
  'for',
  'function',
  'goto',
  'if',
  'in',
  'local',
  'nil',
  'not',
  'or',
  'repeat',
  'return',
  'then',
  'true',
  'until',
  'while',
]);

export function extractLuaFacts(text: string): FnFacts {
  const stripped = stripStringsAndComments(text);

  const sigMatch = /function\s+[\w.:]+\s*\(([^)]*)\)/.exec(text);
  const paramSig = sigMatch ? sigMatch[1]!.replace(/\s+/g, '') : '';

  const isAsync = false;
  const isGenerator = /\bcoroutine\.(yield|wrap|create)\b/.test(stripped);

  const returnExprs = unique(
    [...stripped.matchAll(/\breturn\b([^\n]*)/g)].map((m) => (m[1] ?? '').trim() || '<void>'),
  );
  const throws = unique([...stripped.matchAll(/\berror\s*\(([^)]*)\)/g)].map((m) => m[1]!.trim()));
  const callSites = unique(
    [...stripped.matchAll(/\b([A-Za-z_][\w.:]*)\s*[({"]/g)].map((m) => m[1]!.trim()),
  );
  const branchConditions = unique([
    ...[...stripped.matchAll(/\bif\s+([^\n]+?)\s+then\b/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bwhile\s+([^\n]+?)\s+do\b/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bfor\s+([^\n]+?)\s+do\b/g)].map((m) => `for:${m[1]!.trim()}`),
  ]);

  const effects = new Set<EffectKind>();
  for (const p of LUA_EFFECT_PATTERNS) if (p.match.test(text)) effects.add(p.kind);

  const complexity = 1 + branchConditions.length + (stripped.match(/\band\b|\bor\b/g)?.length ?? 0);

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
    .replace(/--\[\[[\s\S]*?\]\]/g, '')
    .replace(/--[^\n]*/g, '')
    .replace(/\b[A-Za-z_][\w]*\b/g, (m) => (LUA_KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();
}

function stripStringsAndComments(text: string): string {
  return text
    .replace(/--\[\[[\s\S]*?\]\]/g, '')
    .replace(/--[^\n]*/g, '')
    .replace(/'(?:\\.|[^'])*'/g, "''")
    .replace(/"(?:\\.|[^"])*"/g, '""');
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
