import { createHash } from 'node:crypto';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';

// Elixir: `def name(...) do ... end`, `defp name(...) do ... end`, `def name(...), do: expr`
const FUNC_RE =
  /(^|\n)([\s]*)(def(?:p|macro|macrop)?)\s+([\w?!]+)\s*(?:\(([^)]*)\))?\s*(?:,\s*do:\s*([^\n]+)|do\b)/g;

const MODULE_RE = /\bdefmodule\s+([\w.]+)\s+do/g;

export function buildElixirFunctionTable(filePath: string, text: string): FunctionTable {
  const functions = new Map<string, FnEntry>();
  const moduleRanges: Array<{ name: string; start: number; end: number }> = [];
  MODULE_RE.lastIndex = 0;
  let mm: RegExpExecArray | null;
  while ((mm = MODULE_RE.exec(text))) {
    const end = findElixirEnd(text, mm.index + mm[0].length);
    if (end < 0) continue;
    moduleRanges.push({ name: mm[1]!, start: mm.index, end });
  }

  FUNC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FUNC_RE.exec(text))) {
    const declStart = m.index + (m[1]?.length ?? 0);
    const keyword = m[3]!; // def / defp / defmacro / defmacrop
    const name = m[4]!;
    const inlineBody = m[6];
    let endIdx: number;
    if (inlineBody != null) {
      // `, do: expr` form — body extends to end-of-line.
      const eol = text.indexOf('\n', m.index + m[0].length);
      endIdx = eol < 0 ? text.length : eol;
    } else {
      endIdx = findElixirEnd(text, m.index + m[0].length);
      if (endIdx < 0) continue;
    }

    const enclosing = moduleRanges.find((c) => declStart > c.start && endIdx <= c.end);
    const qualified = enclosing ? `${enclosing.name}.${name}` : name;
    const isExported = !keyword.endsWith('p'); // defp / defmacrop are private

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

/** Find matching `end` for an Elixir `do` block, starting at `pos`. */
function findElixirEnd(text: string, pos: number): number {
  let depth = 1;
  // Token scan: `do`/`fn` open, `end` closes. `do:` shorthand doesn't open a block.
  const tokenRe = /\b(do|fn|end)\b(?!:)/g;
  tokenRe.lastIndex = pos;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text))) {
    const t = m[1]!;
    if (t === 'end') {
      depth--;
      if (depth === 0) return m.index + m[0].length;
    } else {
      depth++;
    }
  }
  return -1;
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
    if (ln.startsWith('#') || ln.startsWith('@doc') || ln.startsWith('@moduledoc') || ln === '') {
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
        .replace(/#[^\n]*/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .digest('hex')
    .slice(0, 16);
}
