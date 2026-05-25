import { extractPhpFunctions } from '../tree-sitter/extract-php.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildPhpFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractPhpFunctions(filePath, text);
