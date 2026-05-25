/**
 * Language router — dispatch parsing to the right backend by file extension.
 */

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

export function languageFor(filePath: string): SupportedLanguage | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
  if (
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs')
  )
    return 'javascript';
  if (lower.endsWith('.py') || lower.endsWith('.pyi')) return 'python';
  if (lower.endsWith('.go')) return 'go';
  if (lower.endsWith('.dart')) return 'dart';
  if (lower.endsWith('.java')) return 'java';
  if (lower.endsWith('.kt') || lower.endsWith('.kts')) return 'kotlin';
  if (lower.endsWith('.cs')) return 'csharp';
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.php')) return 'php';
  if (lower.endsWith('.swift')) return 'swift';
  if (lower.endsWith('.lua')) return 'lua';
  if (lower.endsWith('.ex') || lower.endsWith('.exs')) return 'elixir';
  if (lower.endsWith('.m') || lower.endsWith('.mm')) return 'objc';
  if (lower.endsWith('.scala') || lower.endsWith('.sc')) return 'scala';
  if (lower.endsWith('.fs') || lower.endsWith('.fsx') || lower.endsWith('.fsi')) return 'fsharp';
  if (lower.endsWith('.r') || lower.endsWith('.rmd')) return 'r';
  if (lower.endsWith('.gd')) return 'gdscript';
  if (lower.endsWith('.ps1') || lower.endsWith('.psm1') || lower.endsWith('.psd1'))
    return 'powershell';
  return null;
}

export function buildFunctionTable(filePath: string, text: string): FunctionTable {
  switch (languageFor(filePath)) {
    case 'python':
      return buildPythonFunctionTable(filePath, text);
    case 'go':
      return buildGoFunctionTable(filePath, text);
    case 'dart':
      return buildDartFunctionTable(filePath, text);
    case 'java':
      return buildJavaFunctionTable(filePath, text);
    case 'kotlin':
      return buildKotlinFunctionTable(filePath, text);
    case 'csharp':
      return buildCsharpFunctionTable(filePath, text);
    case 'rust':
      return buildRustFunctionTable(filePath, text);
    case 'php':
      return buildPhpFunctionTable(filePath, text);
    case 'swift':
      return buildSwiftFunctionTable(filePath, text);
    case 'lua':
      return buildLuaFunctionTable(filePath, text);
    case 'elixir':
      return buildElixirFunctionTable(filePath, text);
    case 'objc':
      return buildObjcFunctionTable(filePath, text);
    case 'scala':
      return buildScalaFunctionTable(filePath, text);
    case 'fsharp':
      return buildFsharpFunctionTable(filePath, text);
    case 'r':
      return buildRFunctionTable(filePath, text);
    case 'gdscript':
      return buildGdscriptFunctionTable(filePath, text);
    case 'powershell':
      return buildPowershellFunctionTable(filePath, text);
    default:
      return buildTsFunctionTable(filePath, text);
  }
}

export function extractFactsRouted(fnEntry: FnEntry): FnFacts {
  switch (languageFor(fnEntry.filePath)) {
    case 'python':
      return extractPythonFacts(fnEntry.fullText);
    case 'go':
      return extractGoFacts(fnEntry.fullText);
    case 'dart':
      return extractDartFacts(fnEntry.fullText);
    case 'java':
      return extractJavaFacts(fnEntry.fullText);
    case 'kotlin':
      return extractKotlinFacts(fnEntry.fullText);
    case 'csharp':
      return extractCsharpFacts(fnEntry.fullText);
    case 'rust':
      return extractRustFacts(fnEntry.fullText);
    case 'php':
      return extractPhpFacts(fnEntry.fullText);
    case 'swift':
      return extractSwiftFacts(fnEntry.fullText);
    case 'lua':
      return extractLuaFacts(fnEntry.fullText);
    case 'elixir':
      return extractElixirFacts(fnEntry.fullText);
    case 'objc':
      return extractObjcFacts(fnEntry.fullText);
    case 'scala':
      return extractScalaFacts(fnEntry.fullText);
    case 'fsharp':
      return extractFsharpFacts(fnEntry.fullText);
    case 'r':
      return extractRFacts(fnEntry.fullText);
    case 'gdscript':
      return extractGdscriptFacts(fnEntry.fullText);
    case 'powershell':
      return extractPowershellFacts(fnEntry.fullText);
    default:
      return extractTsFacts(fnEntry.fullText, fnEntry.kind);
  }
}
