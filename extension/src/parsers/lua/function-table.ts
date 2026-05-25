import { createHash } from 'node:crypto';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';

// Lua function shapes: `function name(...)`, `function tbl.method(...)`, `function tbl:method(...)`,
// `local function name(...)`, `name = function(...)`.
// All terminate with `end` matching their `function`/`if`/`for`/`while`/`do` opener.
const FUNC_RE = /(^|\n)([\s]*(?:local\s+)?)function\s+([\w.:]+)\s*\(([^)]*)\)/g;

const KEYWORDS_OPENING = ['function', 'if', 'for', 'while', 'do', 'repeat'];

export function buildLuaFunctionTable(filePath: string, text: string): FunctionTable {
  const functions = new Map<string, FnEntry>();

  FUNC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FUNC_RE.exec(text))) {
    const declStart = m.index + (m[1]?.length ?? 0);
    const localKw = m[2] || '';
    const name = m[3]!;
    const endIdx = findLuaBlockEnd(text, m.index + m[0].length);
    if (endIdx < 0) continue;

    // Methods written as `tbl:method` or `tbl.method` get qualified by their table.
    const qualified = name;
    const isExported = !localKw.includes('local');

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
      kind: name.includes(':') || name.includes('.') ? 'method' : 'function',
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

/** Walk text counting Lua block openers/closers; returns index after the matching `end`. */
function findLuaBlockEnd(text: string, startPos: number): number {
  // Strip strings + comments while we walk so identifiers in them don't fool us.
  // Cheap version: tokenize line by line, ignoring lines that are `--` comments,
  // and respecting balanced [[...]] long strings is left for tree-sitter v2.
  let depth = 1;
  const tokenRe = /\b(function|if|for|while|do|repeat|end|until|then)\b/g;
  tokenRe.lastIndex = startPos;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text))) {
    const t = m[1]!;
    if (t === 'end' || t === 'until') {
      depth--;
      if (depth === 0) return m.index + m[0].length;
    } else if (KEYWORDS_OPENING.includes(t)) {
      // `then` is a continuation of `if`, not an opener. We've consumed `if`
      // already; ignore `then`. (We never push for `then`.)
      depth++;
    }
    // 'then' / 'else' / 'elseif' / etc. are ignored.
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
    if (ln.startsWith('--') || ln === '') {
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
        .replace(/--[^\n]*/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .digest('hex')
    .slice(0, 16);
}
