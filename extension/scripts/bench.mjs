#!/usr/bin/env node
/**
 * Block A — corpus benchmark harness.
 *
 * Walks extension/test/corpus/<lang>/*.json, runs the engine on each example,
 * and reports precision / recall per detector class plus FP rate on
 * should-not-emit cases.
 *
 * Exit code:
 *   0   if precision ≥ 0.80 AND recall ≥ 0.70 AND FP-rate ≤ 0.15
 *   1   otherwise (CI gate failure)
 *
 * Run with:  pnpm --filter extension bench
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const corpusRoot = resolve(__dirname, '..', 'test', 'corpus');

// We import the compiled engine modules. Run `pnpm build` first.
const distExt = resolve(__dirname, '..', 'dist', 'extension.js');
try {
  statSync(distExt);
} catch {
  console.error('[bench] dist/extension.js not found. Run `pnpm --filter extension build` first.');
  process.exit(2);
}

// The bundle is a CommonJS extension, not importable directly. For now we
// re-invoke the engine modules straight from source via tsx — but that
// requires extra deps. Simpler approach: shell out to node + ts-node for
// each example. To keep the harness dep-free, we read the corpus + report
// only — the actual engine invocation is left for the next iteration.
//
// This script intentionally runs without invoking the engine yet, so it
// always exits 0. Real measurement is wired in the next iteration when
// the corpus has enough examples to make the gate meaningful.

const cases = walkCorpus(corpusRoot);
const byLang = new Map();
for (const c of cases) {
  if (!byLang.has(c.language)) byLang.set(c.language, []);
  byLang.get(c.language).push(c);
}

console.log('ImpactFlow corpus benchmark');
console.log('===========================');
console.log(`Total examples: ${cases.length}`);
console.log();
for (const [lang, exs] of [...byLang.entries()].sort()) {
  const positive = exs.filter((e) => e.expectedDiffs.length > 0).length;
  const negative = exs.filter((e) => e.expectedDiffs.length === 0).length;
  console.log(
    `  ${lang.padEnd(12)}  ${exs.length.toString().padStart(3)} examples  (${positive} positive · ${negative} should-not-emit)`,
  );
}
console.log();
console.log('Status: SEED — engine invocation pending.');
console.log(
  'To make the gate meaningful, add ~200 labelled examples and wire the engine call in this script.',
);
console.log();

const t0 = performance.now();
// Real engine invocation would happen here. For now the harness exits 0.
const dt = performance.now() - t0;
console.log(`Done in ${dt.toFixed(1)} ms.`);

function walkCorpus(root) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return out;
  }
  for (const langDir of entries) {
    const langPath = join(root, langDir);
    let s;
    try {
      s = statSync(langPath);
    } catch {
      continue;
    }
    if (!s.isDirectory()) continue;
    for (const file of readdirSync(langPath)) {
      if (!file.endsWith('.json')) continue;
      try {
        const c = JSON.parse(readFileSync(join(langPath, file), 'utf8'));
        if (c && typeof c === 'object' && c.language) out.push(c);
      } catch {
        /* skip malformed */
      }
    }
  }
  return out;
}

// Reference to pathToFileURL retained so we can wire dynamic import in v2.
void pathToFileURL;
