import { extractObjcFunctions } from '../tree-sitter/extract-objc.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildObjcFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractObjcFunctions(filePath, text);
