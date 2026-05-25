import { createHash } from 'node:crypto';
import { findMatchingBrace, lineOf } from '../brace-helper.js';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';

// `- (Type)methodName:(Arg)x part:(Arg)y { ... }` or `+ (Type)classMethod { ... }`
const METHOD_RE = /(^|\n)([\s]*)([-+])\s*\(([^)]+)\)\s*([A-Za-z_]\w*)(\s*:[^{]+)?\s*\{/g;
const IMPL_RE = /@implementation\s+(\w+)/g;

export function buildObjcFunctionTable(filePath: string, text: string): FunctionTable {
  const functions = new Map<string, FnEntry>();
  // @implementation ... @end is bounded by `@end`, not `}`.
  const implRanges: Array<{ name: string; start: number; end: number }> = [];
  IMPL_RE.lastIndex = 0;
  let im: RegExpExecArray | null;
  while ((im = IMPL_RE.exec(text))) {
    const end = text.indexOf('@end', im.index);
    if (end < 0) continue;
    implRanges.push({ name: im[1]!, start: im.index, end });
  }

  METHOD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = METHOD_RE.exec(text))) {
    const declStart = m.index + (m[1]?.length ?? 0);
    const kind = m[3]!; // '-' instance, '+' class
    const firstSelector = m[5]!;
    const braceIdx = text.indexOf('{', m.index + m[0].length - 1);
    if (braceIdx < 0) continue;
    const closeIdx = findMatchingBrace(text, braceIdx);
    if (closeIdx < 0) continue;

    const enclosing = implRanges.find((c) => declStart > c.start && closeIdx <= c.end);
    const qualified = enclosing
      ? `${enclosing.name}${kind === '+' ? '+' : '.'}${firstSelector}`
      : firstSelector;
    const isExported = !!enclosing; // @implementation methods are public surface in ObjC

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
    if (ln.startsWith('///') || ln.startsWith('//!') || ln.startsWith('//') || ln === '') {
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
        .replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .digest('hex')
    .slice(0, 16);
}
