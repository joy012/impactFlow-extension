import { createHash } from 'node:crypto';
import { findMatchingBrace, lineOf } from '../brace-helper.js';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';

// Dart function/method/constructor declarations. Matches:
//   ReturnType name(params) {
//   void name() async {
//   factory ClassName.named() = ...;  (skipped — no body)
//   Type get prop => ...; (also handled)
//
// We require either a `{` or `=>` to follow the parameter list.
const DECL_RE =
  /(^|\n)(?:\s*(?:@\w+(?:\([^)]*\))?\s*\n?\s*)*)?\s*(?:static\s+|external\s+|abstract\s+|factory\s+|@override\s+|@protected\s+)*(?:Future<[^>]*>|Stream<[^>]*>|[\w<>?,.\s\[\]]+?\s+)?(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)\s*(?:async\*?|sync\*)?\s*(\{|=>)/g;

// Class header — for qualifying methods.
const CLASS_RE = /\bclass\s+(\w+)/g;

export function buildDartFunctionTable(filePath: string, text: string): FunctionTable {
  const functions = new Map<string, FnEntry>();

  // Map each char offset to its enclosing class name by scanning class definitions
  // and following brace structure. We keep this simple — only outermost class.
  const classRanges: Array<{ name: string; start: number; end: number }> = [];
  CLASS_RE.lastIndex = 0;
  let cm: RegExpExecArray | null;
  while ((cm = CLASS_RE.exec(text))) {
    const open = text.indexOf('{', cm.index);
    if (open < 0) continue;
    const close = findMatchingBrace(text, open);
    if (close < 0) continue;
    classRanges.push({ name: cm[1]!, start: cm.index, end: close });
  }

  DECL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DECL_RE.exec(text))) {
    const declStart = m.index + (m[1]?.length ?? 0);
    const name = m[2]!;
    const opener = m[4]!;
    // Skip Dart language keywords misidentified as function names
    if (['if', 'for', 'while', 'switch', 'return', 'do', 'else', 'class', 'enum'].includes(name)) {
      continue;
    }

    let endIdx: number;
    if (opener === '{') {
      const braceIdx = text.indexOf('{', m.index + m[0].length - 1);
      if (braceIdx < 0) continue;
      const close = findMatchingBrace(text, braceIdx);
      if (close < 0) continue;
      endIdx = close;
    } else {
      // arrow body — terminate at `;`
      const semi = text.indexOf(';', m.index + m[0].length);
      if (semi < 0) continue;
      endIdx = semi;
    }

    const enclosing = classRanges.find((c) => declStart > c.start && endIdx <= c.end);
    const qualified = enclosing ? `${enclosing.name}.${name}` : name;
    // Dart's exported-by-non-underscore convention.
    const isExported = !name.startsWith('_');

    const startLine = lineOf(text, declStart);
    const endLine = lineOf(text, endIdx);
    const fullText = text.slice(declStart, endIdx + 1);
    const leadingDocText = collectLeadingDoc(text, declStart);
    const leadingDocHash = leadingDocText
      ? createHash('sha1').update(leadingDocText).digest('hex').slice(0, 16)
      : '';
    const id = `${filePath}::${qualified}`;
    functions.set(id, {
      id,
      name: qualified,
      kind: enclosing ? 'method' : 'function',
      startLine,
      endLine,
      bodyHash: hashBody(fullText),
      fullText,
      filePath,
      isExported,
      leadingDocText,
      leadingDocHash,
    });
  }
  return { filePath, functions };
}

// Collects `/// doc` lines and `@annotation` lines immediately above the declaration.
function collectLeadingDoc(text: string, declStart: number): string {
  let lineStart = declStart;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
  const lines: string[] = [];
  let p = lineStart - 1;
  while (p > 0) {
    let s = p;
    while (s > 0 && text[s - 1] !== '\n') s--;
    const ln = text.slice(s, p).trim();
    if (ln.startsWith('///') || ln.startsWith('//') || ln.startsWith('@')) {
      lines.unshift(ln);
      p = s - 1;
    } else {
      break;
    }
  }
  return lines.join('\n');
}

function hashBody(text: string): string {
  const stripped = text
    .replace(/\/\/\/?[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha1').update(stripped).digest('hex').slice(0, 16);
}
