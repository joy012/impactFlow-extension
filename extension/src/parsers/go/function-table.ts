import { extractGoFunctions } from '../tree-sitter/extract-go.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildGoFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractGoFunctions(filePath, text);
