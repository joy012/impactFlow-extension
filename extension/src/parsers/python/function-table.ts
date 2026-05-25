import { extractPythonFunctions } from '../tree-sitter/extract-python.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildPythonFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractPythonFunctions(filePath, text);
