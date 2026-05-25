import { extractGdscriptFunctions } from '../tree-sitter/extract-gdscript.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildGdscriptFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractGdscriptFunctions(filePath, text);
