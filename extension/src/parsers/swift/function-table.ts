import { extractSwiftFunctions } from '../tree-sitter/extract-swift.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildSwiftFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractSwiftFunctions(filePath, text);
