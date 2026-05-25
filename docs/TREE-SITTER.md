# Tree-Sitter Migration Plan (Block G)

> Status: **deferred** — the biggest single remaining engineering block. Scaffold + Python port estimated at ~1.5–2 weeks of focused solo work; per-language ports after that are ~1–2 days each.

Today every non-TypeScript language uses a **regex-based** function-table extractor (Python uses indent-aware regex; the brace languages use `brace-helper.ts` + per-language regex; the indent languages have their own). This is honest but lossy. Tree-sitter replaces all 18 of those regex parsers with a single, accurate AST-driven flow.

## Why tree-sitter

| Concern | Today (regex) | After tree-sitter |
|---|---|---|
| Multi-line strings, template literals, heredocs | brittle | handled by grammar |
| Macros (Rust, C++) | treated as call-sites | real AST nodes |
| Nested classes / generic constraints | partial | exact |
| Incremental re-parse on keystroke | re-parse every time | reuse prior parse tree → ~10× faster |
| New language ports | days of regex tuning | hours via tree-sitter queries |
| VSIX size | extension.js is 5.7 MB because ts-morph bundles the TS compiler | tree-sitter core is ~200 KB; each grammar WASM is ~100–400 KB; total ~5 MB for 19 grammars |

## Architecture

```
extension/src/parsers/tree-sitter/
├── init.ts              one-time Parser.init({ locateFile });
├── grammar-cache.ts     lazy-load + cache per-language WASM
├── queries/
│   ├── python.scm       captures function definitions, params, returns
│   ├── go.scm
│   ├── java.scm
│   └── … per language
└── extract.ts           generic function-table extractor over tree-sitter trees

extension/dist/grammars/  ← copied at build time from node_modules
├── tree-sitter.wasm
└── tree-sitter-<lang>.wasm × 19
```

The grammars are loaded **lazily** the first time a file of that language is parsed, and cached in `globalStorageUri/grammars/` so subsequent VS Code restarts skip the bundle scan.

## Build-time integration

1. Add `web-tree-sitter` runtime dep
2. Add `tree-sitter-python`, `tree-sitter-go`, … as **dev** deps — these are the npm packages that ship the WASM
3. New build step `scripts/copy-grammars.mjs`: for each grammar package, copy its `*.wasm` to `extension/dist/grammars/`
4. esbuild leaves `web-tree-sitter` external (it loads WASM via `fetch`-equivalent at runtime, not bundled JS)
5. `.vscodeignore` removed for `dist/grammars/**` so they ship in the VSIX

Estimated VSIX size after migration: roughly the same (~5 MB) — the WASM grammars + tree-sitter core replace the ts-morph + TS-compiler bundle.

## Migration order

Per language. Each port:

1. Write `queries/<lang>.scm` with captures for `@function.def`, `@function.name`, `@param.list`, `@return.expr`, `@throw.expr`, `@call.target`, `@branch.condition`, `@async.modifier`.
2. Re-implement `extension/src/parsers/<lang>/function-table.ts` against tree-sitter; remove the regex version.
3. Re-implement `extension/src/parsers/<lang>/facts.ts` against tree-sitter; remove the regex version.
4. Re-run the language's existing tests + the corpus benchmark; verify precision/recall doesn't regress.

Recommended order:

1. **Python** (the regex parser is the most lossy here — indent-tracking is fragile).
2. **TypeScript / JavaScript** — drop ts-morph entirely; saves ~5 MB from the bundle.
3. **Go, Java, Kotlin, C#, Rust, Dart** — the popular braced languages.
4. **PHP, Ruby, Swift, Objective-C** — Tier 3, also braced.
5. **Lua, Scala, Elixir, F#, R, GDScript, PowerShell** — the rest.

## Why not done in this session

- WASM bundling requires a build pipeline change (one-shot but ~half a day of trial-and-error to get correct paths, CSP, `locateFile` hook in the extension host).
- 19 language ports × ~1 day each = 3 weeks of follow-on work.
- The regex parsers are *honest and working today* — precision/recall is unmeasured but tests pass. Migrating without first establishing the corpus benchmark (Block A) means we can't tell if the migration is a regression or an improvement.

Recommended sequencing: **Block A (corpus benchmark) first, then Block G (tree-sitter)** — so we have measurable before/after numbers.

## Estimated effort

| Step | Effort |
|---|---|
| WASM build pipeline + `Parser.init` flow + dist copy | 1 day |
| Generic `extract.ts` over tree-sitter trees | 1 day |
| Python port (most-complex regex parser today; biggest win) | 1 day |
| Each subsequent language port | ~0.5–1 day |
| **Total to migrate all 19** | **2.5–3 weeks** |

After tree-sitter lands, the four still-missing languages (none currently — we shipped F#, R, GDScript, PowerShell) and any future language (Crystal, Nim, Zig, etc.) become roughly half-day additions.
