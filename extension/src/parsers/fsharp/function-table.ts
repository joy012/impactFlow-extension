import { createHash } from 'node:crypto';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';

// F# `let [rec] [visibility] name [args] =`  body is indented or single-line.
const FUNC_RE =
  /(^|\n)([ \t]*)let\s+(?:rec\s+)?(?:(?:private|internal|public)\s+)?([\w']+)\s*(?:\(([^)]*)\)|([\w'\s]*))?\s*=/g;

const MODULE_RE = /\b(?:module|namespace)\s+(\w+)/g;

export function buildFsharpFunctionTable(filePath: string, text: string): FunctionTable {
  const functions = new Map<string, FnEntry>();

  // Track module ranges by scanning module declarations + their indentation block.
  const moduleRanges: Array<{ name: string; start: number; end: number }> = [];
  MODULE_RE.lastIndex = 0;
  let mm: RegExpExecArray | null;
  while ((mm = MODULE_RE.exec(text))) {
    // Modules span until next module decl or EOF. Treat as flat.
    moduleRanges.push({ name: mm[1]!, start: mm.index, end: text.length });
  }

  FUNC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FUNC_RE.exec(text))) {
    const declStart = m.index + (m[1]?.length ?? 0);
    const indent = (m[2] ?? '').length;
    const name = m[3]!;

    // Find end by indentation: body extends through all lines with indent > current
    // (skipping blanks). If the `=` is followed by content on the same line, single-line.
    const eolIdx = text.indexOf('\n', m.index + m[0].length);
    let endIdx = eolIdx < 0 ? text.length : eolIdx;
    // Try multi-line: scan forward
    const lines = text.slice(eolIdx + 1).split('\n');
    let consumed = 0;
    for (const line of lines) {
      if (!line.trim()) {
        consumed += line.length + 1;
        continue;
      }
      const candIndent = line.match(/^[ \t]*/)?.[0]?.length ?? 0;
      if (candIndent <= indent) break;
      consumed += line.length + 1;
    }
    if (consumed > 0) endIdx = eolIdx + 1 + consumed;

    const enclosing = moduleRanges.find((r) => declStart >= r.start);
    const qualified = enclosing ? `${enclosing.name}.${name}` : name;
    const isExported = !/\bprivate\b/.test(text.slice(m.index, m.index + 50));

    const startLine = lineOf(text, declStart);
    const endLine = lineOf(text, endIdx);
    const fullText = text.slice(declStart, endIdx);
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

function lineOf(text: string, pos: number): number {
  let line = 1;
  for (let i = 0; i < pos && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
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
    if (ln.startsWith('///') || ln.startsWith('//') || ln.startsWith('[<') || ln === '') {
      if (ln) lines.unshift(ln);
      p = s - 1;
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
        .replace(/\/\/[^\n]*|\(\*[\s\S]*?\*\)/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .digest('hex')
    .slice(0, 16);
}
