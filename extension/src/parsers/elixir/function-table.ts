import { extractElixirFunctions } from '../tree-sitter/extract-elixir.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildElixirFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractElixirFunctions(filePath, text);
