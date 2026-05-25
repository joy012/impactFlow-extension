import { extractDartFunctions } from '../tree-sitter/extract-dart.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildDartFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractDartFunctions(filePath, text);
