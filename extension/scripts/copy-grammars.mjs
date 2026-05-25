#!/usr/bin/env node
/**
 * Copies tree-sitter runtime + grammar WASM files into dist/grammars/.
 * Runs as part of `build:host`.
 *
 * Why this exists: esbuild bundles JS, but WASM has to be a real file at
 * runtime so `Language.load(absolutePath)` can read it via fs.
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const outDir = resolve(__dirname, '..', 'dist', 'grammars');
mkdirSync(outDir, { recursive: true });

const targets = [
  // (npm package, file inside the package, output filename)
  ['web-tree-sitter', 'web-tree-sitter.wasm', 'tree-sitter.wasm'],
  ['tree-sitter-python', 'tree-sitter-python.wasm', 'tree-sitter-python.wasm'],
  ['tree-sitter-javascript', 'tree-sitter-javascript.wasm', 'tree-sitter-javascript.wasm'],
  ['tree-sitter-typescript', 'tree-sitter-typescript.wasm', 'tree-sitter-typescript.wasm'],
  ['tree-sitter-typescript', 'tree-sitter-tsx.wasm', 'tree-sitter-tsx.wasm'],
];

for (const [pkg, relPath, outName] of targets) {
  // Prefer subpath resolution (works with strict `exports` like web-tree-sitter).
  let src;
  try {
    src = require.resolve(`${pkg}/${relPath}`);
  } catch {
    // Fallback: look directly under node_modules. Sufficient when the package
    // doesn't expose its package.json via `exports` and has no subpath entry.
    src = resolve(__dirname, '..', 'node_modules', pkg, relPath);
  }
  if (!existsSync(src)) {
    console.error(`[copy-grammars] missing ${src}`);
    process.exit(1);
  }
  const dst = join(outDir, outName);
  copyFileSync(src, dst);
  console.log(`[copy-grammars] ${pkg} → dist/grammars/${outName}`);
}
