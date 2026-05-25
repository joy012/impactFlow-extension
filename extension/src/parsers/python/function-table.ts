/**
 * Python function-table extractor — regex/indentation-based.
 * Not as accurate as ts-morph for TS, but Python's indentation-sensitive syntax
 * gives us reliable function boundaries without a real AST.
 *
 * Tree-sitter is the planned v2 upgrade (docs/ROADMAP.md (H. Tree-sitter upgrade)).
 */

import { createHash } from 'node:crypto';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';

const DEF_RE = /^(\s*)(async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/;
const CLASS_RE = /^(\s*)class\s+([A-Za-z_][\w]*)/;

export function buildPythonFunctionTable(filePath: string, text: string): FunctionTable {
  const lines = text.split(/\r?\n/);
  const functions = new Map<string, FnEntry>();
  const classStack: Array<{ name: string; indent: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;

    // Track class scope.
    const cMatch = CLASS_RE.exec(line);
    if (cMatch) {
      const indent = cMatch[1]!.length;
      while (classStack.length && classStack[classStack.length - 1]!.indent >= indent) {
        classStack.pop();
      }
      classStack.push({ name: cMatch[2]!, indent });
      continue;
    }

    const dMatch = DEF_RE.exec(line);
    if (!dMatch) {
      // Pop classes when dedent past their scope.
      const leading = line.match(/^(\s*)/)![1]!.length;
      while (classStack.length && classStack[classStack.length - 1]!.indent >= leading) {
        classStack.pop();
      }
      continue;
    }

    const indent = dMatch[1]!.length;
    while (classStack.length && classStack[classStack.length - 1]!.indent >= indent) {
      classStack.pop();
    }
    const enclosingClass = classStack[classStack.length - 1];
    const fnName = dMatch[3]!;
    const qualified = enclosingClass ? `${enclosingClass.name}.${fnName}` : fnName;
    const kind = enclosingClass ? ('method' as const) : ('function' as const);

    // Find the end line by indentation.
    const startLine1 = i + 1;
    let endLine1 = startLine1;
    for (let j = i + 1; j < lines.length; j++) {
      const cand = lines[j]!;
      if (!cand.trim()) {
        endLine1 = j + 1;
        continue;
      }
      const candIndent = cand.match(/^(\s*)/)![1]!.length;
      if (candIndent <= indent) break;
      endLine1 = j + 1;
    }

    const fullText = lines.slice(startLine1 - 1, endLine1).join('\n');
    const leadingDocText = collectPythonLeadingDoc(lines, i, indent);
    const bodyHash = hashBody(fullText);
    const leadingDocHash = leadingDocText
      ? createHash('sha1').update(leadingDocText).digest('hex').slice(0, 16)
      : '';

    const isExported = !fnName.startsWith('_') || fnName === '__init__' || fnName === '__call__';
    const id = `${filePath}::${qualified}`;
    functions.set(id, {
      id,
      name: qualified,
      kind,
      startLine: startLine1,
      endLine: endLine1,
      bodyHash,
      fullText,
      filePath,
      isExported,
      leadingDocText,
      leadingDocHash,
    });
  }

  return { filePath, functions };
}

/**
 * Collect Python leading "doc" — decorator lines + docstring (first statement
 * of the body if it's a string literal). Both matter for stale-doc detection.
 */
function collectPythonLeadingDoc(lines: string[], defLineIdx: number, indent: number): string {
  const parts: string[] = [];

  // Decorators above the def line.
  for (let j = defLineIdx - 1; j >= 0; j--) {
    const trimmed = lines[j]!.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('@')) parts.unshift(trimmed);
    else break;
  }

  // Docstring on first non-blank line of body.
  for (let j = defLineIdx + 1; j < lines.length; j++) {
    const candidate = lines[j]!;
    if (!candidate.trim()) continue;
    const candIndent = candidate.match(/^(\s*)/)![1]!.length;
    if (candIndent <= indent) break;
    const trimmed = candidate.trim();
    if (trimmed.startsWith('"""') || trimmed.startsWith("'''") || /^["'`]/.test(trimmed)) {
      // Capture multi-line docstring up to the closing delimiter.
      const delim = trimmed.startsWith('"""') ? '"""' : trimmed.startsWith("'''") ? "'''" : null;
      if (!delim) {
        parts.push(trimmed);
        break;
      }
      if (trimmed.slice(3).includes(delim)) {
        parts.push(trimmed);
      } else {
        const buf = [trimmed];
        for (let k = j + 1; k < lines.length; k++) {
          buf.push(lines[k]!);
          if (lines[k]!.includes(delim)) break;
        }
        parts.push(buf.join('\n'));
      }
    }
    break;
  }

  return parts.join('\n').trim();
}

function hashBody(text: string): string {
  const stripped = text
    .replace(/#[^\n]*/g, '')
    .replace(/'''[\s\S]*?'''/g, '')
    .replace(/"""[\s\S]*?"""/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha1').update(stripped).digest('hex').slice(0, 16);
}
