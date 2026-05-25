import type { EffectKind } from '../../behavior-diff/effect-patterns.js';
import type { FnFacts } from '../../behavior-diff/facts.js';

const CSHARP_EFFECT_PATTERNS: Array<{ kind: EffectKind; match: RegExp }> = [
  { kind: 'network', match: /\b(HttpClient|WebClient|HttpWebRequest)\s*[(.]/ },
  { kind: 'fs', match: /\b(File|Directory|FileStream|StreamReader|StreamWriter)\s*[(.]/ },
  { kind: 'fs', match: /\b(Path|Path\.Combine)\s*\(/ },
  {
    kind: 'env',
    match: /\bEnvironment\.(GetEnvironmentVariable|SetEnvironmentVariable|GetFolderPath)/,
  },
  { kind: 'env', match: /\bProcess\.Start\s*\(/ },
  { kind: 'console', match: /\bConsole\.(Write|WriteLine|Error|Out)\s*[(.]/ },
  { kind: 'console', match: /\bDebug\.(Write|WriteLine|Log)\s*\(/ },
  {
    kind: 'console',
    match: /\b(ILogger|Logger|Log)\.(LogInformation|LogWarning|LogError|Info|Warn|Error)\s*\(/,
  },
  { kind: 'fs', match: /\b(SqlConnection|DbContext|DbCommand)\s*[(.]/ },
  // Unity engine surface
  { kind: 'globals', match: /\bMonoBehaviour\b/ },
];

const CSHARP_KEYWORDS = new Set([
  'abstract',
  'as',
  'base',
  'bool',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'checked',
  'class',
  'const',
  'continue',
  'decimal',
  'default',
  'delegate',
  'do',
  'double',
  'else',
  'enum',
  'event',
  'explicit',
  'extern',
  'false',
  'finally',
  'fixed',
  'float',
  'for',
  'foreach',
  'goto',
  'if',
  'implicit',
  'in',
  'int',
  'interface',
  'internal',
  'is',
  'lock',
  'long',
  'namespace',
  'new',
  'null',
  'object',
  'operator',
  'out',
  'override',
  'params',
  'private',
  'protected',
  'public',
  'readonly',
  'ref',
  'return',
  'sbyte',
  'sealed',
  'short',
  'sizeof',
  'stackalloc',
  'static',
  'string',
  'struct',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'uint',
  'ulong',
  'unchecked',
  'unsafe',
  'ushort',
  'using',
  'virtual',
  'void',
  'volatile',
  'while',
  'async',
  'await',
  'var',
  'yield',
  'record',
  'init',
  'nameof',
]);

export function extractCsharpFacts(text: string): FnFacts {
  const stripped = stripStringsAndComments(text);

  const sigMatch =
    /(?:(?:public|private|protected|internal|static|virtual|override|abstract|sealed|async|partial|new|extern|readonly|unsafe)\s+)*([\w<>?,.\s\[\]]+?)\s+([A-Za-z_]\w*)\s*(?:<[^>]+>)?\s*\(([^)]*)\)\s*(?:where\s+[^{]+)?\s*\{/.exec(
      text,
    );
  const returnType = sigMatch ? sigMatch[1]!.trim() : null;
  const paramSig = sigMatch ? sigMatch[3]!.replace(/\s+/g, '').replace(/['"]/g, '') : '';

  const isAsync = /\basync\b/.test(text) || /\bTask\b/.test(text) || /\bValueTask\b/.test(text);
  const isGenerator = /\byield\s+(?:return|break)\b/.test(stripped);

  const returnExprs = unique(
    [...stripped.matchAll(/\breturn\b([^;]*)/g)].map((m) => (m[1] ?? '').trim() || '<void>'),
  );
  const throws = unique(
    [...stripped.matchAll(/\bthrow\s+new\s+([A-Z]\w*)\s*\(/g)].map((m) => m[1]!),
  );
  const callSites = unique(
    [...stripped.matchAll(/\b([A-Za-z_][\w.]*)\s*\(/g)].map((m) => m[1]!.trim()),
  );
  const branchConditions = unique([
    ...[...stripped.matchAll(/\bif\s*\(([^)]+)\)/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bwhile\s*\(([^)]+)\)/g)].map((m) => m[1]!.trim()),
    ...[...stripped.matchAll(/\bfor(?:each)?\s*\(([^)]+)\)/g)].map((m) => `for:${m[1]!.trim()}`),
    ...[...stripped.matchAll(/\bswitch\s*\(([^)]+)\)/g)].map((m) => `switch:${m[1]!.trim()}`),
  ]);

  const effects = new Set<EffectKind>();
  for (const p of CSHARP_EFFECT_PATTERNS) {
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
    .replace(/\/\/\/?[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\b[A-Za-z_$][\w$]*\b/g, (m) => (CSHARP_KEYWORDS.has(m) ? m : '_'))
    .replace(/\s+/g, '')
    .trim();
}

function stripStringsAndComments(text: string): string {
  return text
    .replace(/\/\/\/?[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@"(?:""|[^"])*"/g, '""')
    .replace(/"(?:\\.|[^"])*"/g, '""');
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
