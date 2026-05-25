import { extractPowershellFunctions } from '../tree-sitter/extract-powershell.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildPowershellFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractPowershellFunctions(filePath, text);
