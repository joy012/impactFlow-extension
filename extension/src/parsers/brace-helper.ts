/**
 * Shared utility for brace-language parsers (Go, Java, Dart, Kotlin, C#, Rust).
 * Walks past comments + string literals so braces inside them are ignored.
 */

/** Returns the index of the `}` matching the `{` at `openIndex`, or -1. */
export function findMatchingBrace(text: string, openIndex: number): number {
  if (text[openIndex] !== '{') return -1;
  let depth = 0;
  let i = openIndex;
  let inString: '"' | "'" | '`' | null = null;
  let inLine = false;
  let inBlock = false;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLine) {
      if (ch === '\n') inLine = false;
    } else if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i++;
      }
    } else if (inString) {
      if (ch === '\\') {
        i++; // skip escape
      } else if (ch === inString) {
        inString = null;
      }
    } else {
      if (ch === '/' && next === '/') {
        inLine = true;
        i++;
      } else if (ch === '/' && next === '*') {
        inBlock = true;
        i++;
      } else if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch as '"' | "'" | '`';
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
    i++;
  }
  return -1;
}

/** 1-based line number of byte offset `pos`. */
export function lineOf(text: string, pos: number): number {
  let line = 1;
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}
