import { extractRFunctions } from '../tree-sitter/extract-r.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildRFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractRFunctions(filePath, text);
