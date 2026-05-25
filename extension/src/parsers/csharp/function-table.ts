import { extractCsharpFunctions } from '../tree-sitter/extract-csharp.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildCsharpFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractCsharpFunctions(filePath, text);
