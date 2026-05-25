import { createHash } from 'node:crypto';
import type { Node } from 'web-tree-sitter';

export const hashBody = (text: string, lang: 'python' | 'ts'): string => {
  const stripped =
    lang === 'python'
      ? text
          .replace(/#[^\n]*/g, '')
          .replace(/'''[\s\S]*?'''/g, '')
          .replace(/"""[\s\S]*?"""/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      : text
          .replace(/\/\/[^\n]*\n/g, '\n')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\s+/g, ' ')
          .trim();
  return createHash('sha1').update(stripped).digest('hex').slice(0, 16);
};

export const hashDoc = (text: string): string => {
  if (!text) return '';
  return createHash('sha1').update(text).digest('hex').slice(0, 16);
};

export const startLine = (node: Node): number => node.startPosition.row + 1;
export const endLine = (node: Node): number => node.endPosition.row + 1;

export const collectLeadingComments = (node: Node): string => {
  const parts: string[] = [];
  let prev = node.previousSibling;
  let expectedRow = node.startPosition.row;
  while (prev) {
    if (prev.type !== 'comment') break;
    // Only contiguous comments directly above (no blank-line gap).
    if (prev.endPosition.row !== expectedRow - 1 && prev.endPosition.row !== expectedRow) break;
    parts.unshift(prev.text);
    expectedRow = prev.startPosition.row;
    prev = prev.previousSibling;
  }
  return parts.join('\n').trim();
};
