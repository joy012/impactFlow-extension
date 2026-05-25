import { createHash } from 'node:crypto';
import { findMatchingBrace, lineOf } from '../brace-helper.js';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';

// Matches:
//   [modifiers] [generics] [returnType] name(params) [throws X, Y] {
// We anchor on `name(<params>) [throws ...] {` and validate context.
// Skips `if (...) {`, `while (...) {`, etc. via a keyword filter.
const FUNC_LINE_RE =
  /(^|\n)([\s]*(?:@[\w.]+(?:\([^)]*\))?\s*)*(?:(?:public|private|protected|static|final|abstract|synchronized|native|default|strictfp)\s+)*(?:<[^>]+>\s+)?[\w<>?,.\s\[\]]+?)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:throws\s+[\w.<>\s,]+)?\s*\{/g;

const CLASS_RE = /\b(?:class|interface|enum|record)\s+(\w+)/g;

const STATEMENT_KEYWORDS = new Set([
  'if',
  'else',
  'for',
  'while',
  'switch',
  'return',
  'do',
  'try',
  'catch',
  'finally',
  'synchronized',
  'throw',
  'new',
]);

export function buildJavaFunctionTable(filePath: string, text: string): FunctionTable {
  const functions = new Map<string, FnEntry>();

  // Track classes by brace range for method qualification.
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

  FUNC_LINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FUNC_LINE_RE.exec(text))) {
    const declStart = m.index + (m[1]?.length ?? 0);
    const beforeName = m[2]!;
    const name = m[3]!;
    if (STATEMENT_KEYWORDS.has(name)) continue;

    const braceIdx = text.indexOf('{', m.index + m[0].length - 1);
    if (braceIdx < 0) continue;
    const closeIdx = findMatchingBrace(text, braceIdx);
    if (closeIdx < 0) continue;

    const enclosing = innermostClass(classRanges, declStart, closeIdx);
    const qualified = enclosing ? `${enclosing.name}.${name}` : name;
    const isExported =
      /\bpublic\b/.test(beforeName) ||
      /\bprotected\b/.test(beforeName) ||
      // Default-visibility on a public class still counts as a package-public surface.
      (!!enclosing && !/\bprivate\b/.test(beforeName));

    const startLine = lineOf(text, declStart);
    const endLine = lineOf(text, closeIdx);
    const fullText = text.slice(declStart, closeIdx + 1);
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

function innermostClass(
  ranges: Array<{ name: string; start: number; end: number }>,
  start: number,
  end: number,
): { name: string; start: number; end: number } | undefined {
  let best: { name: string; start: number; end: number } | undefined;
  for (const c of ranges) {
    if (start > c.start && end <= c.end) {
      if (!best || c.start > best.start) best = c;
    }
  }
  return best;
}

// Walks back from the declaration capturing `/** */` Javadoc and `@Annotation` lines.
function collectLeadingDoc(text: string, declStart: number): string {
  let lineStart = declStart;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
  // First scan back past blank lines + annotation lines.
  const lines: string[] = [];
  let p = lineStart - 1;
  while (p > 0) {
    let s = p;
    while (s > 0 && text[s - 1] !== '\n') s--;
    const ln = text.slice(s, p).trim();
    if (
      ln.startsWith('@') ||
      ln.startsWith('*') ||
      ln.startsWith('*/') ||
      ln.startsWith('/**') ||
      ln === ''
    ) {
      if (ln) lines.unshift(ln);
      p = s - 1;
      // Stop after the opening `/**` of a Javadoc block.
      if (ln.startsWith('/**')) break;
    } else {
      break;
    }
  }
  return lines.join('\n');
}

function hashBody(text: string): string {
  const stripped = text
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha1').update(stripped).digest('hex').slice(0, 16);
}
