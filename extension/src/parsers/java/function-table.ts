import { extractJavaFunctions } from '../tree-sitter/extract-java.js';
import type { FunctionTable } from '../typescript/function-table.js';

export const buildJavaFunctionTable = (filePath: string, text: string): FunctionTable =>
  extractJavaFunctions(filePath, text);
