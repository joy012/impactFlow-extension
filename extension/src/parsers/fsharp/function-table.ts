import { extractFsharpFunctions } from '../tree-sitter/extract-fsharp.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildFsharpFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractFsharpFunctions(filePath, text);
