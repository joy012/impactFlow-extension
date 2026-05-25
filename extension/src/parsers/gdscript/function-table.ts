// GDScript = Python-shaped. Reuse the Python regex parser with `func` instead of `def`.
import { createHash } from 'node:crypto';
import type { FnEntry, FunctionTable } from '../typescript/function-table.js';

const FUNC_RE = /^(\s*)(static\s+)?func\s+(\w+)\s*\(/;
const CLASS_RE = /^(\s*)class_name\s+(\w+)|^(\s*)class\s+(\w+)/;

export function buildGdscriptFunctionTable(filePath: string, text: string): FunctionTable {
  const functions = new Map<string, FnEntry>();
  const lines = text.split(/\r?\n/);
  const classStack: Array<{ name: string; indent: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;

    const cMatch = CLASS_RE.exec(line);
    if (cMatch) {
      const indent = (cMatch[1] ?? cMatch[3] ?? '').length;
      const name = cMatch[2] ?? cMatch[4]!;
      while (classStack.length && classStack[classStack.length - 1]!.indent >= indent) {
        classStack.pop();
      }
      classStack.push({ name, indent });
      continue;
    }

    const fMatch = FUNC_RE.exec(line);
    if (!fMatch) continue;
    const indent = fMatch[1]!.length;
    while (classStack.length && classStack[classStack.length - 1]!.indent >= indent) {
      classStack.pop();
    }
    const enclosing = classStack[classStack.length - 1];
    const fnName = fMatch[3]!;
    const qualified = enclosing ? `${enclosing.name}.${fnName}` : fnName;

    const startLine = i + 1;
    let endLine = startLine;
    for (let j = i + 1; j < lines.length; j++) {
      const cand = lines[j]!;
      if (!cand.trim()) {
        endLine = j + 1;
        continue;
      }
      const candIndent = cand.match(/^\s*/)?.[0]?.length ?? 0;
      if (candIndent <= indent) break;
      endLine = j + 1;
    }

    const fullText = lines.slice(startLine - 1, endLine).join('\n');
    const isExported = !fnName.startsWith('_');
    const leadingDocText = collectLeadingDoc(lines, i);
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

function collectLeadingDoc(lines: string[], defIdx: number): string {
  const parts: string[] = [];
  for (let j = defIdx - 1; j >= 0; j--) {
    const t = lines[j]!.trim();
    if (!t) continue;
    if (t.startsWith('#') || t.startsWith('@')) parts.unshift(t);
    else break;
  }
  return parts.join('\n');
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
