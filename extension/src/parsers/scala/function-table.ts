import { createHash } from 'node:crypto';
import { findMatchingBrace, lineOf } from '../brace-helper.js';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';

// Scala 2/3 method declarations. Brace-bodied form covered here; expression-bodied
// (`def f = expr`) is captured only if it's followed by a `{`.
const FUNC_RE =
  /(^|\n)([\s]*(?:@\w+\s*)*(?:(?:override|private|protected|public|implicit|final|abstract|sealed|lazy|inline)\s+)*)def\s+(\w+)\s*(?:\[[^\]]+\])?\s*(\(([^)]*)\))?(?:\s*:\s*[^={]+?)?\s*=\s*\{/g;

const TYPE_RE = /\b(?:class|object|trait|enum)\s+(\w+)/g;

export function buildScalaFunctionTable(filePath: string, text: string): FunctionTable {
  const functions = new Map<string, FnEntry>();
  const typeRanges: Array<{ name: string; start: number; end: number }> = [];
  TYPE_RE.lastIndex = 0;
  let tm: RegExpExecArray | null;
  while ((tm = TYPE_RE.exec(text))) {
    const open = text.indexOf('{', tm.index);
    if (open < 0) continue;
    const close = findMatchingBrace(text, open);
    if (close < 0) continue;
    typeRanges.push({ name: tm[1]!, start: tm.index, end: close });
  }

  FUNC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FUNC_RE.exec(text))) {
    const declStart = m.index + (m[1]?.length ?? 0);
    const modifiers = m[2] || '';
    const name = m[3]!;
    const braceIdx = text.indexOf('{', m.index + m[0].length - 1);
    if (braceIdx < 0) continue;
    const closeIdx = findMatchingBrace(text, braceIdx);
    if (closeIdx < 0) continue;

    const enclosing = typeRanges
      .filter((c) => declStart > c.start && closeIdx <= c.end)
      .sort((a, b) => b.start - a.start)[0];
    const qualified = enclosing ? `${enclosing.name}.${name}` : name;
    const isExported = !/\bprivate\b/.test(modifiers);

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

function collectLeadingDoc(text: string, declStart: number): string {
  let lineStart = declStart;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
  const lines: string[] = [];
  let p = lineStart - 1;
  while (p > 0) {
    let s = p;
    while (s > 0 && text[s - 1] !== '\n') s--;
    const ln = text.slice(s, p).trim();
    if (ln.startsWith('*') || ln.startsWith('/**') || ln.startsWith('@') || ln === '') {
      if (ln) lines.unshift(ln);
      p = s - 1;
      if (ln.startsWith('/**')) break;
    } else {
      break;
    }
  }
  return lines.join('\n');
}

function hashBody(text: string): string {
  return createHash('sha1')
    .update(
      text
        .replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .digest('hex')
    .slice(0, 16);
}
