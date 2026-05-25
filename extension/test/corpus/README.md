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

Output: precision / recall per detector class, plus FP rate per "must-not-emit"
bucket. Exits non-zero on regression > 2 percentage points vs. baseline.

## Status

⚠️ The corpus is currently bootstrapped with **a small seed set** (~10–15
examples). The Phase 2 §6.4 quality gate (≥80% precision · ≥70% recall · ≤15%
FP rate on a 200-example corpus) is not yet measurable until more examples are
contributed.

Adding examples is welcome: drop a JSON file in the appropriate language folder
and re-run the bench script. Real OSS PRs (referenced by URL in the JSON's
`source` field) are preferred over synthetic examples.
