/**
 * Vitest setupFiles entry. Runs once per worker, in the SAME module context
 * as the tests — so the grammar LRU cache populated here is visible to
 * synchronous buildFunctionTable() calls in every test file.
 *
 * Cost: ~50–150 ms per worker on first run.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll } from 'vitest';
import { prepareGrammars } from '../src/parsers/tree-sitter/grammar-cache.js';
import { setGrammarRoot } from '../src/parsers/tree-sitter/init.js';

const __filename = fileURLToPath(import.meta.url);
const extensionRoot = resolve(__filename, '..', '..');

beforeAll(async () => {
  setGrammarRoot(resolve(extensionRoot, 'dist', 'grammars'));
  await prepareGrammars(['python', 'typescript', 'tsx', 'javascript']);
});
