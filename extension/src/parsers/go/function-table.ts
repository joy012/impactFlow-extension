import { createHash } from 'node:crypto';
import { findMatchingBrace, lineOf } from '../brace-helper.js';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';

// Captures: receiver block (optional), function name
const FUNC_RE = /func\s+(?:\(\s*\w+\s+\*?(\w+)\s*\)\s+)?(\w+)\s*\(/g;

export function buildGoFunctionTable(filePath: string, text: string): FunctionTable {
  const functions = new Map<string, FnEntry>();
  // Reset regex state
  FUNC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FUNC_RE.exec(text))) {
    const recvType = m[1];
    const name = m[2]!;
    const braceIdx = text.indexOf('{', m.index);
    if (braceIdx < 0) continue;
    const closeIdx = findMatchingBrace(text, braceIdx);
    if (closeIdx < 0) continue;

    const startLine = lineOf(text, m.index);
    const endLine = lineOf(text, closeIdx);
    const fullText = text.slice(m.index, closeIdx + 1);
    const qualified = recvType ? `${recvType}.${name}` : name;
    // Go's exported-by-capital-letter convention
    const isExported = /^[A-Z]/.test(name);
    const leadingDocText = collectLeadingDoc(text, m.index);
    const leadingDocHash = leadingDocText
      ? createHash('sha1').update(leadingDocText).digest('hex').slice(0, 16)
      : '';
    const id = `${filePath}::${qualified}`;
    functions.set(id, {
      id,
      name: qualified,
      kind: recvType ? 'method' : 'function',
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

// Walks backward from the function declaration capturing contiguous `// ` lines.
function collectLeadingDoc(text: string, funcStart: number): string {
  // Walk back to the previous newline, then collect lines that start with `//`.
  let lineStart = funcStart;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
  // Now lineStart is the start of the func's line. Walk back over prior comment lines.
  const lines: string[] = [];
  let p = lineStart - 1;
  while (p > 0) {
    let s = p;
    while (s > 0 && text[s - 1] !== '\n') s--;
    const ln = text.slice(s, p).trim();
    if (ln.startsWith('//')) {
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
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha1').update(stripped).digest('hex').slice(0, 16);
}
