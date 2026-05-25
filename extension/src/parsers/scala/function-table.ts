import { extractScalaFunctions } from '../tree-sitter/extract-scala.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildScalaFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractScalaFunctions(filePath, text);
