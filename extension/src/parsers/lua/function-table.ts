import { extractLuaFunctions } from '../tree-sitter/extract-lua.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildLuaFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractLuaFunctions(filePath, text);
