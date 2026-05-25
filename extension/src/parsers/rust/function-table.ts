import { createHash } from 'node:crypto';
import { findMatchingBrace, lineOf } from '../brace-helper.js';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';

const FUNC_RE =
  /(^|\n)([\s]*(?:#\[[^\]]+\]\s*)*(?:(?:pub(?:\([^)]+\))?|async|const|unsafe|extern(?:\s+"[^"]+")?)\s+)*)fn\s+(\w+)\s*(?:<[^>]+>)?\s*\(/g;

const IMPL_RE = /\bimpl\s+(?:<[^>]+>\s+)?(?:[\w:<>,?'\s+]+?\s+for\s+)?([\w:<>]+)/g;

export function buildRustFunctionTable(filePath: string, text: string): FunctionTable {
  const functions = new Map<string, FnEntry>();

  const implRanges: Array<{ name: string; start: number; end: number }> = [];
  IMPL_RE.lastIndex = 0;
  let im: RegExpExecArray | null;
  while ((im = IMPL_RE.exec(text))) {
    const open = text.indexOf('{', im.index);
    if (open < 0) continue;
    const close = findMatchingBrace(text, open);
    if (close < 0) continue;
    implRanges.push({ name: im[1]!.split(/[<:]/)[0]!, start: im.index, end: close });
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

    const enclosing = innermost(implRanges, declStart, closeIdx);
    const qualified = enclosing ? `${enclosing.name}.${name}` : name;
    const isExported = /\bpub\b/.test(modifiers);

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

function innermost(
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

function collectLeadingDoc(text: string, declStart: number): string {
  let lineStart = declStart;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
  const lines: string[] = [];
  let p = lineStart - 1;
  while (p > 0) {
    let s = p;
    while (s > 0 && text[s - 1] !== '\n') s--;
    const ln = text.slice(s, p).trim();
    if (ln.startsWith('///') || ln.startsWith('//!') || ln.startsWith('#[') || ln === '') {
      if (ln) lines.unshift(ln);
      p = s - 1;
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
