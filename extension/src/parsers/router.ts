import type { FnFacts } from '../behavior-diff/facts.js';
import { extractFacts as extractTsFacts } from '../behavior-diff/facts.js';
import { extractCsharpFacts } from './csharp/facts.js';
import { buildCsharpFunctionTable } from './csharp/function-table.js';
import { extractDartFacts } from './dart/facts.js';
import { buildDartFunctionTable } from './dart/function-table.js';
import { extractElixirFacts } from './elixir/facts.js';
import { buildElixirFunctionTable } from './elixir/function-table.js';
import { extractFsharpFacts } from './fsharp/facts.js';
import { buildFsharpFunctionTable } from './fsharp/function-table.js';
import { extractGdscriptFacts } from './gdscript/facts.js';
import { buildGdscriptFunctionTable } from './gdscript/function-table.js';
import { extractGoFacts } from './go/facts.js';
import { buildGoFunctionTable } from './go/function-table.js';
import { extractJavaFacts } from './java/facts.js';
import { buildJavaFunctionTable } from './java/function-table.js';
import { extractKotlinFacts } from './kotlin/facts.js';
import { buildKotlinFunctionTable } from './kotlin/function-table.js';
import { extractLuaFacts } from './lua/facts.js';
import { buildLuaFunctionTable } from './lua/function-table.js';
import { extractObjcFacts } from './objc/facts.js';
import { buildObjcFunctionTable } from './objc/function-table.js';
import { extractPhpFacts } from './php/facts.js';
import { buildPhpFunctionTable } from './php/function-table.js';
import { extractPowershellFacts } from './powershell/facts.js';
import { buildPowershellFunctionTable } from './powershell/function-table.js';
import { extractPythonFacts } from './python/facts.js';
import { buildPythonFunctionTable } from './python/function-table.js';
import { extractRFacts } from './r/facts.js';
import { buildRFunctionTable } from './r/function-table.js';
import { extractRustFacts } from './rust/facts.js';
import { buildRustFunctionTable } from './rust/function-table.js';
import { extractScalaFacts } from './scala/facts.js';
import { buildScalaFunctionTable } from './scala/function-table.js';
import { extractSwiftFacts } from './swift/facts.js';
import { buildSwiftFunctionTable } from './swift/function-table.js';
import { buildFunctionTable as buildTsFunctionTable } from './typescript/function-table.js';
import type { FnEntry, FunctionTable } from './typescript/function-table.js';

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'dart'
  | 'java'
  | 'kotlin'
  | 'csharp'
  | 'rust'
  | 'php'
  | 'swift'
  | 'lua'
  | 'elixir'
  | 'objc'
  | 'scala'
  | 'fsharp'
  | 'r'
  | 'gdscript'
  | 'powershell';

type Adapter = {
  build: (filePath: string, text: string) => FunctionTable;
  facts: (text: string) => FnFacts;
};

const EXTENSIONS: Array<[RegExp, SupportedLanguage]> = [
  [/\.(ts|tsx)$/i, 'typescript'],
  [/\.(js|jsx|mjs|cjs)$/i, 'javascript'],
  [/\.(py|pyi)$/i, 'python'],
  [/\.go$/i, 'go'],
  [/\.dart$/i, 'dart'],
  [/\.java$/i, 'java'],
  [/\.(kt|kts)$/i, 'kotlin'],
  [/\.cs$/i, 'csharp'],
  [/\.rs$/i, 'rust'],
  [/\.php$/i, 'php'],
  [/\.swift$/i, 'swift'],
  [/\.lua$/i, 'lua'],
  [/\.(ex|exs)$/i, 'elixir'],
  [/\.(m|mm)$/i, 'objc'],
  [/\.(scala|sc)$/i, 'scala'],
  [/\.(fs|fsx|fsi)$/i, 'fsharp'],
  [/\.(r|rmd)$/i, 'r'],
  [/\.gd$/i, 'gdscript'],
  [/\.(ps1|psm1|psd1)$/i, 'powershell'],
];

// Wrap the TS facts adapter so its signature matches the others (single-arg `text`).
const tsFactsAdapter = (text: string): FnFacts => extractTsFacts(text, 'function');

const ADAPTERS: Record<SupportedLanguage, Adapter> = {
  typescript: { build: buildTsFunctionTable, facts: tsFactsAdapter },
  javascript: { build: buildTsFunctionTable, facts: tsFactsAdapter },
  python: { build: buildPythonFunctionTable, facts: extractPythonFacts },
  go: { build: buildGoFunctionTable, facts: extractGoFacts },
  dart: { build: buildDartFunctionTable, facts: extractDartFacts },
  java: { build: buildJavaFunctionTable, facts: extractJavaFacts },
  kotlin: { build: buildKotlinFunctionTable, facts: extractKotlinFacts },
  csharp: { build: buildCsharpFunctionTable, facts: extractCsharpFacts },
  rust: { build: buildRustFunctionTable, facts: extractRustFacts },
  php: { build: buildPhpFunctionTable, facts: extractPhpFacts },
  swift: { build: buildSwiftFunctionTable, facts: extractSwiftFacts },
  lua: { build: buildLuaFunctionTable, facts: extractLuaFacts },
  elixir: { build: buildElixirFunctionTable, facts: extractElixirFacts },
  objc: { build: buildObjcFunctionTable, facts: extractObjcFacts },
  scala: { build: buildScalaFunctionTable, facts: extractScalaFacts },
  fsharp: { build: buildFsharpFunctionTable, facts: extractFsharpFacts },
  r: { build: buildRFunctionTable, facts: extractRFacts },
  gdscript: { build: buildGdscriptFunctionTable, facts: extractGdscriptFacts },
  powershell: { build: buildPowershellFunctionTable, facts: extractPowershellFacts },
};

export const languageFor = (filePath: string): SupportedLanguage | null => {
  for (const [re, lang] of EXTENSIONS) {
    if (re.test(filePath)) return lang;
  }
  return null;
};

export const buildFunctionTable = (filePath: string, text: string): FunctionTable => {
  const lang = languageFor(filePath);
  return (lang ? ADAPTERS[lang] : ADAPTERS.typescript).build(filePath, text);
};

export const extractFactsRouted = (fnEntry: FnEntry): FnFacts => {
  const lang = languageFor(fnEntry.filePath);
  if (lang === 'typescript' || lang === 'javascript' || lang === null) {
    // TS extractor still needs the FunctionKind for wrapping; keep that path explicit.
    return extractTsFacts(fnEntry.fullText, fnEntry.kind);
  }
  return ADAPTERS[lang].facts(fnEntry.fullText);
};
