# Behavior-Diff Corpus

This folder holds labelled `(baseline, current, expectedDiffs)` triples used to
measure the precision / recall / false-positive rate of the engine.

## Layout

```
extension/test/corpus/
├── README.md                this file
├── ts/                      TypeScript examples
│   ├── 01-add-param.json
│   └── ...
├── python/                  Python examples
│   ├── 01-async-becomes-sync.json
│   └── ...
└── …                        per-language
```

## Example JSON shape

```json
{
  "language": "typescript",
  "title": "Function gains a second parameter",
  "before": "function add(a: number) { return a; }",
  "after": "function add(a: number, b: number) { return a + b; }",
  "expectedDiffs": ["signature", "return_shape"],
  "shouldNotEmit": []
}
```

For "must-not-emit" cases (formatting changes, pure renames, dead code), set
`expectedDiffs: []` and list the would-be false positives in `shouldNotEmit`.

## Running

```bash
pnpm --filter extension bench
```

The harness:

1. JIT-bundles the engine (esbuild → `dist/bench/bench-engine.mjs`) — no
   extra deps, no separate build step.
2. Walks `test/corpus/<lang>/*.json`, runs the engine on every example.
3. Pairs the before/after function tables by name (falls back to the first
   function if names don't match).
4. Computes per-detector precision / recall + an overall FP rate over the
   `expectedDiffs: []` cases.
5. Compares the report to `.baseline.json` and **exits 1** if any detector
   regresses precision or recall by > 2pp, or if the overall FP rate goes
   above 15%.

### Updating the baseline

```bash
pnpm --filter extension bench -- --write-baseline
```

Do this whenever an *intended* engine improvement raises the bar — the new
numbers become the floor for future runs.

## Status

The harness now runs end-to-end against the seed corpus. The Phase 2 §6.4
quality gate (≥80% precision · ≥70% recall · ≤15% FP rate on a 200-example
corpus) becomes meaningful as the corpus grows. Today's snapshot (10 examples)
sits at ~82% overall precision · 100% recall · 0% FP rate — see
`.baseline.json` for the live numbers.

Adding examples is welcome: drop a JSON file in the appropriate language folder
and re-run the bench script. Real OSS PRs (referenced by URL in the JSON's
`source` field) are preferred over synthetic examples.
