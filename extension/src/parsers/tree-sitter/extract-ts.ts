import type { Language, Node } from 'web-tree-sitter';
import type { FnEntry, FunctionKind, FunctionTable } from '../typescript/function-table.js';
import { collectLeadingComments, endLine, hashBody, hashDoc, startLine } from './common.js';
import { getLoadedGrammar } from './grammar-cache.js';
import { newParser } from './init.js';

export const extractTsFunctions = (filePath: string, text: string): FunctionTable => {
  const parser = newParser();
  parser.setLanguage(pickGrammar(filePath));
  const tree = parser.parse(text);
  const functions = new Map<string, FnEntry>();
  if (!tree) {
    parser.delete();
    return { filePath, functions };
  }

  const root = tree.rootNode;
  for (let i = 0; i < root.namedChildCount; i++) {
    const child = root.namedChild(i);
    if (!child) continue;
    handleTopLevel(child, false, filePath, functions);
  }

  tree.delete();
  parser.delete();
  return { filePath, functions };
};

const pickGrammar = (filePath: string): Language => {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tsx')) return getLoadedGrammar('tsx');
  if (lower.endsWith('.ts')) return getLoadedGrammar('typescript');
  return getLoadedGrammar('javascript');
};

const handleTopLevel = (
  node: Node,
  parentExported: boolean,
  filePath: string,
  out: Map<string, FnEntry>,
): void => {
  switch (node.type) {
    case 'export_statement':
      handleExportStatement(node, filePath, out);
      return;
    case 'function_declaration':
    case 'generator_function_declaration':
      emitFunctionDeclaration(node, node, parentExported, false, filePath, out);
      return;
    case 'class_declaration':
    case 'abstract_class_declaration':
      handleClass(node, parentExported, filePath, out);
      return;
    case 'lexical_declaration':
    case 'variable_declaration':
      handleVariableStatement(node, node, parentExported, filePath, out);
      return;
  }
};

const handleExportStatement = (node: Node, filePath: string, out: Map<string, FnEntry>): void => {
  let isDefault = false;
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c && c.text === 'default') {
      isDefault = true;
      break;
    }
  }

  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (!c) continue;
    switch (c.type) {
      case 'function_declaration':
      case 'generator_function_declaration':
        emitFunctionDeclaration(c, node, true, isDefault, filePath, out);
        return;
      case 'class_declaration':
      case 'abstract_class_declaration':
        handleClass(c, true, filePath, out);
        return;
      case 'lexical_declaration':
      case 'variable_declaration':
        handleVariableStatement(c, node, true, filePath, out);
        return;
    }
  }

  if (isDefault) {
    const valueField = node.childForFieldName('value');
    const expr =
      valueField ?? findFirstChildOfType(node, ['arrow_function', 'function_expression']);
    if (expr && (expr.type === 'arrow_function' || expr.type === 'function_expression')) {
      emit(expr, node, 'default', 'default-export', true, filePath, out);
    }
  }
};

const emitFunctionDeclaration = (
  fn: Node,
  docAnchor: Node,
  isExported: boolean,
  isDefault: boolean,
  filePath: string,
  out: Map<string, FnEntry>,
): void => {
  const nameNode = fn.childForFieldName('name');
  const name = nameNode?.text ?? (isDefault ? 'default' : '(anonymous)');
  emit(fn, docAnchor, name, 'function', isExported || isDefault, filePath, out);
};

const handleClass = (
  cls: Node,
  classExported: boolean,
  filePath: string,
  out: Map<string, FnEntry>,
): void => {
  const nameNode = cls.childForFieldName('name');
  const className = nameNode?.text ?? '(anonymous)';
  const body = cls.childForFieldName('body');
  if (!body) return;

  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i);
    if (member?.type === 'method_definition') {
      emitMethod(member, className, classExported, filePath, out);
    }
  }
};

const emitMethod = (
  method: Node,
  className: string,
  classExported: boolean,
  filePath: string,
  out: Map<string, FnEntry>,
): void => {
  const nameNode = method.childForFieldName('name');
  const methodName = nameNode?.text ?? '(anonymous)';

  let isPrivate = false;
  let isGetter = false;
  let isSetter = false;
  const isConstructor = methodName === 'constructor';

  for (let i = 0; i < method.childCount; i++) {
    const c = method.child(i);
    if (!c) continue;
    if (c.type === 'accessibility_modifier') {
      const t = c.text;
      if (t === 'private' || t === 'protected') isPrivate = true;
    }
    if (c.type === 'get') isGetter = true;
    if (c.type === 'set') isSetter = true;
  }

  const qualifiedName = isConstructor
    ? `${className}.constructor`
    : isGetter
      ? `${className}.get ${methodName}`
      : isSetter
        ? `${className}.set ${methodName}`
        : `${className}.${methodName}`;

  // Constructors inherit class visibility regardless of accessibility modifier.
  const isExported = isConstructor ? classExported : classExported && !isPrivate;
  emit(method, method, qualifiedName, 'method', isExported, filePath, out);
};

const handleVariableStatement = (
  stmt: Node,
  docAnchor: Node,
  isExported: boolean,
  filePath: string,
  out: Map<string, FnEntry>,
): void => {
  for (let i = 0; i < stmt.namedChildCount; i++) {
    const decl = stmt.namedChild(i);
    if (!decl || decl.type !== 'variable_declarator') continue;
    const nameNode = decl.childForFieldName('name');
    const valueNode = decl.childForFieldName('value');
    if (!nameNode || !valueNode) continue;
    if (nameNode.type !== 'identifier') continue;
    if (valueNode.type !== 'arrow_function' && valueNode.type !== 'function_expression') continue;
    // For single-declarator statements, anchor doc on the statement so leading JSDoc is captured.
    const docNode = stmt.namedChildCount === 1 ? docAnchor : valueNode;
    emit(valueNode, docNode, nameNode.text, 'arrow', isExported, filePath, out);
  }
};

const emit = (
  node: Node,
  docAnchor: Node,
  name: string,
  kind: FunctionKind,
  isExported: boolean,
  filePath: string,
  out: Map<string, FnEntry>,
): void => {
  const id = `${filePath}::${name}`;
  const fullText = node.text;
  const leadingDocText = collectLeadingComments(docAnchor);
  out.set(id, {
    id,
    name,
    kind,
    startLine: startLine(node),
    endLine: endLine(node),
    bodyHash: hashBody(fullText, 'ts'),
    fullText,
    filePath,
    isExported,
    leadingDocText,
    leadingDocHash: hashDoc(leadingDocText),
  });
};

const findFirstChildOfType = (node: Node, types: string[]): Node | null => {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c && types.includes(c.type)) return c;
  }
  return null;
};
