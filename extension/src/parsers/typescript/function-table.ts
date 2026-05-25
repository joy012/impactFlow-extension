/**
 * Function-table extraction for TS/JS.
 * Phase 1 — structural extraction only; behavior-diff (Phase 2) consumes this.
 */

import { createHash } from 'node:crypto';
import {
  type ArrowFunction,
  type FunctionDeclaration,
  type FunctionExpression,
  Node,
  Project,
  ScriptKind,
  type SourceFile,
  SyntaxKind,
} from 'ts-morph';

export type FunctionKind = 'function' | 'method' | 'arrow' | 'default-export';

export interface FnEntry {
  id: string;
  name: string;
  kind: FunctionKind;
  /** 1-based line number of the function declaration head. */
  startLine: number;
  endLine: number;
  /** Normalized body hash — equal hashes mean the function body did not change. */
  bodyHash: string;
  /** Full text of the function for downstream Phase 2 diffing. */
  fullText: string;
  /** Source file path the function belongs to. */
  filePath: string;
  /** True if the function is on the file's public surface (exported / public class member). */
  isExported: boolean;
  /** Leading JSDoc / line comments directly above the function. Hash for stale-doc detection. */
  leadingDocText: string;
  leadingDocHash: string;
}

export interface FunctionTable {
  filePath: string;
  /** Keyed by FnEntry.id. */
  functions: Map<string, FnEntry>;
}

/** Single shared in-memory Project used by all callers in Phase 1. */
const project = new Project({
  useInMemoryFileSystem: true,
  skipAddingFilesFromTsConfig: true,
  compilerOptions: { allowJs: true, jsx: 4 /* React */, target: 99, module: 99 },
});

/**
 * Parse a single file's text and extract a FunctionTable.
 * Pure: does not touch disk or VS Code state.
 */
export function buildFunctionTable(filePath: string, text: string): FunctionTable {
  const scriptKind = pickScriptKind(filePath);
  // Re-using a stable virtual path per call keeps memory bounded while the parser
  // is hot, and per-file parses cannot collide because we remove and re-add.
  const virtualPath = `virtual:${filePath}`;
  const existing = project.getSourceFile(virtualPath);
  if (existing) existing.forget();
  const sf = project.createSourceFile(virtualPath, text, { scriptKind, overwrite: true });

  const functions = new Map<string, FnEntry>();
  walk(sf, filePath, functions);
  sf.forget();
  return { filePath, functions };
}

function pickScriptKind(filePath: string): ScriptKind {
  if (filePath.endsWith('.tsx')) return ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ScriptKind.JSX;
  if (filePath.endsWith('.js')) return ScriptKind.JS;
  return ScriptKind.TS;
}

function walk(sf: SourceFile, filePath: string, out: Map<string, FnEntry>): void {
  // 1. Top-level function declarations.
  for (const fn of sf.getFunctions()) {
    const exported = fn.isExported() || fn.isDefaultExport();
    pushFn(fn, fn.getName() ?? 'default', 'function', filePath, exported, out);
  }

  // 2. Class methods, constructors, accessors.
  for (const cls of sf.getClasses()) {
    const className = cls.getName() ?? '(anonymous)';
    const classExported = cls.isExported() || cls.isDefaultExport();
    for (const m of cls.getInstanceMethods().concat(cls.getStaticMethods())) {
      const isPublic =
        classExported &&
        !m.hasModifier(SyntaxKind.PrivateKeyword) &&
        !m.hasModifier(SyntaxKind.ProtectedKeyword);
      pushNode(m, `${className}.${m.getName()}`, 'method', filePath, isPublic, out);
    }
    for (const ctor of cls.getConstructors()) {
      pushNode(ctor, `${className}.constructor`, 'method', filePath, classExported, out);
    }
    for (const acc of cls.getInstanceProperties()) {
      if (acc.getKind() === SyntaxKind.GetAccessor || acc.getKind() === SyntaxKind.SetAccessor) {
        const prefix = acc.getKind() === SyntaxKind.GetAccessor ? 'get' : 'set';
        const name = `${className}.${prefix} ${(acc as { getName(): string }).getName()}`;
        pushNode(acc, name, 'method', filePath, classExported, out);
      }
    }
  }

  // 3. Variable declarations bound to arrow / function expressions.
  for (const stmt of sf.getVariableStatements()) {
    const exported = stmt.isExported();
    for (const decl of stmt.getDeclarations()) {
      const init = decl.getInitializer();
      if (!init) continue;
      if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) {
        pushFn(init, decl.getName(), 'arrow', filePath, exported, out);
      }
    }
  }

  // 4. Default export expression that's a function/arrow.
  const def = sf.getDefaultExportSymbol();
  if (def) {
    for (const d of def.getDeclarations()) {
      if (Node.isExportAssignment(d)) {
        const expr = d.getExpression();
        if (Node.isArrowFunction(expr) || Node.isFunctionExpression(expr)) {
          pushFn(expr, 'default', 'default-export', filePath, true, out);
        }
      }
    }
  }
}

function pushFn(
  fn: FunctionDeclaration | FunctionExpression | ArrowFunction,
  name: string,
  kind: FunctionKind,
  filePath: string,
  isExported: boolean,
  out: Map<string, FnEntry>,
): void {
  pushNode(fn, name, kind, filePath, isExported, out);
}

function pushNode(
  node: Node,
  name: string,
  kind: FunctionKind,
  filePath: string,
  isExported: boolean,
  out: Map<string, FnEntry>,
): void {
  const id = `${filePath}::${name}`;
  const start = node.getStartLineNumber();
  const end = node.getEndLineNumber();
  const fullText = node.getText();
  const bodyHash = hashBody(fullText);
  const leadingDocText = collectLeadingDoc(node);
  const leadingDocHash = leadingDocText
    ? createHash('sha1').update(leadingDocText).digest('hex').slice(0, 16)
    : '';
  out.set(id, {
    id,
    name,
    kind,
    startLine: start,
    endLine: end,
    bodyHash,
    fullText,
    filePath,
    isExported,
    leadingDocText,
    leadingDocHash,
  });
}

function collectLeadingDoc(node: Node): string {
  // ts-morph: leading comments are accessible via getLeadingCommentRanges.
  const sf = node.getSourceFile();
  const full = sf.getFullText();
  const ranges = node.getLeadingCommentRanges();
  if (!ranges.length) return '';
  // Take the comment block(s) immediately preceding this node.
  return ranges
    .map((r) => full.slice(r.getPos(), r.getEnd()))
    .join('\n')
    .trim();
}

/**
 * Body-hash strategy: strip comments + collapse all whitespace, then sha1.
 * Catches functional changes; ignores formatting-only edits.
 */
function hashBody(text: string): string {
  const stripped = text
    .replace(/\/\/[^\n]*\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha1').update(stripped).digest('hex').slice(0, 16);
}
