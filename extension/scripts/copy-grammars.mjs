#!/usr/bin/env node
// Copies tree-sitter runtime + grammar WASM files into dist/grammars/.
// Runs as part of build:host. WASM must be a real file at runtime so Language.load() can read it.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const outDir = resolve(__dirname, '..', 'dist', 'grammars');
mkdirSync(outDir, { recursive: true });

// [npm package, file inside package, output filename]
const targets = [
  ['web-tree-sitter', 'web-tree-sitter.wasm', 'tree-sitter.wasm'],
  ['tree-sitter-python', 'tree-sitter-python.wasm', 'tree-sitter-python.wasm'],
  ['tree-sitter-javascript', 'tree-sitter-javascript.wasm', 'tree-sitter-javascript.wasm'],
  ['tree-sitter-typescript', 'tree-sitter-typescript.wasm', 'tree-sitter-typescript.wasm'],
  ['tree-sitter-typescript', 'tree-sitter-tsx.wasm', 'tree-sitter-tsx.wasm'],
  ['tree-sitter-go', 'tree-sitter-go.wasm', 'tree-sitter-go.wasm'],
  ['tree-sitter-java', 'tree-sitter-java.wasm', 'tree-sitter-java.wasm'],
  ['tree-sitter-rust', 'tree-sitter-rust.wasm', 'tree-sitter-rust.wasm'],
  ['tree-sitter-c-sharp', 'tree-sitter-c_sharp.wasm', 'tree-sitter-csharp.wasm'],
  ['tree-sitter-php', 'tree-sitter-php_only.wasm', 'tree-sitter-php.wasm'],
  ['tree-sitter-scala', 'tree-sitter-scala.wasm', 'tree-sitter-scala.wasm'],
  ['tree-sitter-dart', 'tree-sitter-dart.wasm', 'tree-sitter-dart.wasm'],
  ['tree-sitter-objc', 'tree-sitter-objc.wasm', 'tree-sitter-objc.wasm'],
  ['tree-sitter-elixir', 'tree-sitter-elixir.wasm', 'tree-sitter-elixir.wasm'],
  ['@tree-sitter-grammars/tree-sitter-lua', 'tree-sitter-lua.wasm', 'tree-sitter-lua.wasm'],
  ['@tree-sitter-grammars/tree-sitter-kotlin', 'tree-sitter-kotlin.wasm', 'tree-sitter-kotlin.wasm'],
];

for (const [pkg, relPath, outName] of targets) {
  let src;
  try {
    src = require.resolve(`${pkg}/${relPath}`);
  } catch {
    src = resolve(__dirname, '..', 'node_modules', pkg, relPath);
  }
  if (!existsSync(src)) {
    console.error(`[copy-grammars] missing ${src}`);
    process.exit(1);
  }
  copyFileSync(src, join(outDir, outName));
  console.log(`[copy-grammars] ${pkg} → dist/grammars/${outName}`);
}
