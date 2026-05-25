#!/usr/bin/env node
/**
 * Block A — corpus benchmark harness.
 *
 * Walks extension/test/corpus/<lang>/*.json, runs the engine on each example,
 * and reports precision / recall per detector class plus FP rate on
 * should-not-emit cases.
 *
 * Exit code:
 *   0   if no detector regresses precision/recall by more than 2pp vs.
 *       extension/test/corpus/.baseline.json AND overall FP rate ≤ 0.15
 *   1   otherwise (CI gate failure)
 *   2   environment problem (missing build deps, etc.)
 *
 * Run with:  pnpm --filter extension bench
 * Update baseline:  pnpm --filter extension bench -- --write-baseline
 */

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(__dirname, '..');
const corpusRoot = resolve(extensionRoot, 'test', 'corpus');
const baselinePath = resolve(corpusRoot, '.baseline.json');
const benchOutDir = resolve(extensionRoot, 'dist', 'bench');
const benchEntry = resolve(__dirname, 'bench-engine.entry.ts');
const benchBundle = resolve(benchOutDir, 'bench-engine.mjs');

const writeBaseline = process.argv.includes('--write-baseline');
const PRECISION_REGRESSION_PP = 0.02;
const RECALL_REGRESSION_PP = 0.02;
const FP_RATE_HARD_CAP = 0.15;

const DETECTOR_TYPES = [
  'signature',
  'asyncness',
  'return_shape',
  'branch_logic',
  'call_set',
  'throw_set',
  'side_effect_surface',
  'stale_doc',
  'complexity_jump',
];

// Default filename per language so the router picks the right parser.
const LANG_FILE = {
  typescript: 'sample.ts',
  javascript: 'sample.js',
  python: 'sample.py',
  go: 'sample.go',
  dart: 'sample.dart',
  java: 'Sample.java',
  kotlin: 'Sample.kt',
  csharp: 'Sample.cs',
  rust: 'sample.rs',
  php: 'sample.php',
  swift: 'Sample.swift',
  lua: 'sample.lua',
  elixir: 'sample.ex',
  objc: 'sample.m',
  scala: 'Sample.scala',
  fsharp: 'sample.fs',
  r: 'sample.R',
  gdscript: 'sample.gd',
  powershell: 'sample.ps1',
};

await main();

async function main() {
  await buildBenchBundle();
  const mod = await import(pathToFileURL(benchBundle).href);
  const { buildFunctionTable, diffBehavior, setGrammarRoot, prepareGrammars } = mod;

  // Tree-sitter setup: point at dist/grammars and pre-load the grammars the
  // corpus exercises. buildFunctionTable() is sync; the async load happens once.
  setGrammarRoot(resolve(extensionRoot, 'dist', 'grammars'));
  await prepareGrammars(['python', 'typescript', 'tsx', 'javascript']);

  const cases = walkCorpus(corpusRoot);
  if (cases.length === 0) {
    console.error('[bench] No corpus examples found under', corpusRoot);
    process.exit(2);
  }

  const t0 = performance.now();
  const stats = makeEmptyStats();
  const failures = [];
  let evaluated = 0;
  let skipped = 0;

  for (const c of cases) {
    const filename = LANG_FILE[c.language];
    if (!filename) {
      skipped++;
      continue;
    }

    let actual;
    try {
      actual = runEngine(c, filename, buildFunctionTable, diffBehavior);
    } catch (err) {
      failures.push({ title: c.title, language: c.language, reason: String(err) });
      continue;
    }

    evaluated++;
    score(c, actual, stats);
  }

  const dt = performance.now() - t0;

  const report = buildReport(stats);
  printReport(report, { evaluated, skipped, totalCases: cases.length, durationMs: dt });

  if (failures.length > 0) {
    console.log();
    console.log(`⚠️  ${failures.length} example(s) errored during evaluation:`);
    for (const f of failures.slice(0, 10)) {
      console.log(`   - [${f.language}] ${f.title}: ${f.reason}`);
    }
    if (failures.length > 10) console.log(`   …and ${failures.length - 10} more`);
  }

  if (writeBaseline) {
    mkdirSync(corpusRoot, { recursive: true });
    writeFileSync(baselinePath, `${JSON.stringify(report, null, 2)}\n`);
    console.log();
    console.log(`✏️  Baseline written to ${relativeTo(baselinePath, extensionRoot)}`);
    process.exit(0);
  }

  const baseline = readBaseline();
  if (!baseline) {
    console.log();
    console.log('ℹ️  No baseline file present. Run with `--write-baseline` to seed one.');
    console.log('    (Exit 0 since we have nothing to regress against yet.)');
    process.exit(0);
  }

  const regressions = compareToBaseline(report, baseline);
  if (regressions.length > 0) {
    console.log();
    console.log('❌ Regressions vs. baseline:');
    for (const r of regressions) console.log(`   - ${r}`);
    process.exit(1);
  }
  if (report.overall.fpRate > FP_RATE_HARD_CAP) {
    console.log();
    console.log(
      `❌ Overall FP rate ${pct(report.overall.fpRate)} exceeds hard cap ${pct(FP_RATE_HARD_CAP)}.`,
    );
    process.exit(1);
  }
  console.log();
  console.log('✅ No regressions vs. baseline.');
}

/* ----------------------------- engine wiring ----------------------------- */

function runEngine(example, filename, buildFunctionTable, diffBehavior) {
  const before = buildFunctionTable(filename, example.before);
  const after = buildFunctionTable(filename, example.after);
  const pair = pickFunctionPair(before, after);
  if (!pair) {
    throw new Error(
      `no function pair found (before=${before.functions.size}, after=${after.functions.size})`,
    );
  }
  const result = diffBehavior(pair.before, pair.after);
  return new Set(result.diffs.map((d) => d.type));
}

function pickFunctionPair(beforeTable, afterTable) {
  const beforeFns = [...beforeTable.functions.values()];
  const afterFns = [...afterTable.functions.values()];
  if (beforeFns.length === 0 || afterFns.length === 0) return null;
  // Prefer name match.
  for (const b of beforeFns) {
    const a = afterFns.find((x) => x.name === b.name);
    if (a) return { before: b, after: a };
  }
  // Fallback: pair the first one of each.
  return { before: beforeFns[0], after: afterFns[0] };
}

/* ------------------------------- scoring ------------------------------- */

function makeEmptyStats() {
  /** Per-detector counters. */
  const perDetector = {};
  for (const t of DETECTOR_TYPES) {
    perDetector[t] = { tp: 0, fp: 0, fn: 0 };
  }
  return {
    perDetector,
    overall: {
      shouldNotEmitCases: 0,
      shouldNotEmitFalsePositives: 0,
    },
  };
}

function score(example, actualSet, stats) {
  const expected = new Set(example.expectedDiffs ?? []);
  const shouldNotEmit = new Set(example.shouldNotEmit ?? []);
  const isNegativeCase = expected.size === 0;

  if (isNegativeCase) stats.overall.shouldNotEmitCases++;

  for (const t of DETECTOR_TYPES) {
    const expHas = expected.has(t);
    const actHas = actualSet.has(t);
    if (expHas && actHas) stats.perDetector[t].tp++;
    else if (!expHas && actHas) {
      stats.perDetector[t].fp++;
      // Anything emitted on a should-not-emit example counts towards FP rate.
      if (isNegativeCase || shouldNotEmit.has(t)) stats.overall.shouldNotEmitFalsePositives++;
    } else if (expHas && !actHas) stats.perDetector[t].fn++;
  }
}

function buildReport(stats) {
  const perDetector = {};
  let tpAll = 0;
  let fpAll = 0;
  let fnAll = 0;
  for (const [type, c] of Object.entries(stats.perDetector)) {
    perDetector[type] = {
      tp: c.tp,
      fp: c.fp,
      fn: c.fn,
      precision: safeRatio(c.tp, c.tp + c.fp),
      recall: safeRatio(c.tp, c.tp + c.fn),
    };
    tpAll += c.tp;
    fpAll += c.fp;
    fnAll += c.fn;
  }
  const overall = {
    precision: safeRatio(tpAll, tpAll + fpAll),
    recall: safeRatio(tpAll, tpAll + fnAll),
    fpRate: safeRatio(stats.overall.shouldNotEmitFalsePositives, stats.overall.shouldNotEmitCases),
    shouldNotEmitCases: stats.overall.shouldNotEmitCases,
  };
  return { perDetector, overall };
}

function compareToBaseline(report, baseline) {
  const regressions = [];
  for (const t of DETECTOR_TYPES) {
    const cur = report.perDetector[t];
    const base = baseline.perDetector?.[t];
    if (!base) continue;
    if (base.precision - cur.precision > PRECISION_REGRESSION_PP) {
      regressions.push(
        `${t}: precision dropped ${pct(base.precision)} → ${pct(cur.precision)} (Δ ${pct(base.precision - cur.precision)})`,
      );
    }
    if (base.recall - cur.recall > RECALL_REGRESSION_PP) {
      regressions.push(
        `${t}: recall dropped ${pct(base.recall)} → ${pct(cur.recall)} (Δ ${pct(base.recall - cur.recall)})`,
      );
    }
  }
  if (
    baseline.overall &&
    baseline.overall.precision - report.overall.precision > PRECISION_REGRESSION_PP
  ) {
    regressions.push(
      `overall precision dropped ${pct(baseline.overall.precision)} → ${pct(report.overall.precision)}`,
    );
  }
  return regressions;
}

/* -------------------------------- output -------------------------------- */

function printReport(report, meta) {
  console.log('ImpactFlow corpus benchmark');
  console.log('===========================');
  console.log(
    `Evaluated ${meta.evaluated} / ${meta.totalCases} examples (${meta.skipped} skipped) in ${meta.durationMs.toFixed(1)} ms`,
  );
  console.log();
  console.log('Per-detector:');
  const rows = [['detector', 'tp', 'fp', 'fn', 'precision', 'recall']];
  for (const [t, c] of Object.entries(report.perDetector)) {
    rows.push([t, String(c.tp), String(c.fp), String(c.fn), pct(c.precision), pct(c.recall)]);
  }
  printTable(rows);
  console.log();
  console.log(
    `Overall: precision=${pct(report.overall.precision)} · recall=${pct(report.overall.recall)} · FP-rate=${pct(report.overall.fpRate)} (over ${report.overall.shouldNotEmitCases} should-not-emit cases)`,
  );
}

function printTable(rows) {
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
  for (const r of rows) {
    console.log(`  ${r.map((cell, i) => cell.padEnd(widths[i])).join('  ')}`);
  }
}

function pct(x) {
  if (x === null || Number.isNaN(x)) return '  n/a';
  return `${(x * 100).toFixed(1).padStart(5)}%`;
}

function safeRatio(num, denom) {
  if (denom === 0) return null;
  return num / denom;
}

/* ------------------------------ bench bundle ----------------------------- */

async function buildBenchBundle() {
  mkdirSync(benchOutDir, { recursive: true });
  await build({
    entryPoints: [benchEntry],
    bundle: true,
    outfile: benchBundle,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    sourcemap: false,
    logLevel: 'silent',
    legalComments: 'none',
    // Keep node_modules (ts-morph, etc.) external so Node's loader resolves
    // them at runtime — esbuild's ESM shim can't handle ts-morph's CJS
    // `require('fs')` calls if they're inlined.
    packages: 'external',
  });
}

/* ------------------------------ io helpers ------------------------------ */

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

function readBaseline() {
  try {
    return JSON.parse(readFileSync(baselinePath, 'utf8'));
  } catch {
    return null;
  }
}

function relativeTo(abs, root) {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}
