import { extractKotlinFunctions } from '../tree-sitter/extract-kotlin.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildKotlinFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractKotlinFunctions(filePath, text);
