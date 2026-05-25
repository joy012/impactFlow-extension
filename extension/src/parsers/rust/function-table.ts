import { extractRustFunctions } from '../tree-sitter/extract-rust.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildRustFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractRustFunctions(filePath, text);
