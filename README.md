# ImpactFlow ⚡

> **See what *behavior* changed — not just which files.**
> A VS Code / Cursor extension built for the AI-assisted coding era, where diffs land faster than humans can read them.

---

## 🎯 The problem

AI assistants (Cursor, Copilot, Claude) produce **large, frequent diffs**. You can't review them line-by-line at the speed they appear, and the question that actually matters never gets answered:

> *"After this change, what else in my system is going to behave differently?"*

## ✅ What ImpactFlow does

For every edit, ImpactFlow tells you:

- 🔍 **Exactly what behavior changed** — signature, async-ness, return shape, branches, calls, throws, side effects
- 🌐 **Who depends on it** — callers, tests-to-re-run, package boundaries crossed
- 🎚️ **How risky it is** — transparent 0–10 score with explanations
- 📝 **Drafts the commit + PR** — Conventional-Commits subject + a structured PR body

All **local**. **No network. No AI tokens. No accounts.**

---

## 🆚 Why not just use AI / a linter / a dep graph?

| Tool | Answers |
|---|---|
| 🧹 Linters (ESLint, Biome) | "Is the syntax valid?" |
| 🕸️ Dep graphs (Madge, Nx) | "Which files import what?" |
| 🤖 Copilot / Cursor / Claude | "Explain this code" |
| ⚡ **ImpactFlow** | **"What in my running system now behaves differently — and what should I retest?"** |

AI assistants explain code; they don't have the **whole-codebase reference graph + git history + coverage data** to tell you blast radius. Linters and dep graphs see structure but not behavior. ImpactFlow combines AST diff + behavior classification + caller graph + git context — locally, instantly, every keystroke.

---

## ✨ Features

### Reviewer pack
- 🔥 **Hotspot map** — flags frequently-changed files (90-day git history)
- 👤 **Last-touched badge** — shows the most recent author per modified function
- 📊 **Coverage cross-check** — warns when changed code has < 50% coverage (reads `lcov.info`)
- 🧩 **Complexity badge** — `cc N` per function, alerts on jumps ≥ 3
- 📚 **Stale-doc detector** — body changed but JSDoc/docstring didn't
- 🧪 **Test-impact predictor** — splits callers from *test* callers; tells you exactly what to re-run
- 💀 **Dead-code report** — workspace-wide unused-symbol scan
- 🧹 **Dead-code cleanup** — safety-gated preview + apply (fully undoable)
- 🌿 **Branch-vs-branch compare** — full pipeline between any two refs
- 🔁 **Refactor-safety helper** — rename candidates via LSP
- ✨ **AI prompt copy** — generates a paste-ready prompt for Claude / Copilot / Cursor
- 📝 **Commit + PR drafts** — Conventional Commits + structured PR body
- 🪝 **Pre-commit hook** — warn (default) or block; always bypassable with `--no-verify`
- 📡 **Webhook on high-risk** — opt-in POST (metadata only, no source)
- 🎯 **Focus mode** — dims everything not within ±10 lines of a modified function

### Side panel
- 🎚️ Severity chips (all / medium / high)
- 👆 Click-to-reveal navigation
- 👎 Persistent dismissals
- 🎨 Auto light / dark / high-contrast theme

### Inline + status bar
- 🟥🟧🟦 Gutter circles per severity + overview-ruler marks
- 📍 Status bar `$(pulse) ImpactFlow: 2 high · 5 med` — warning color on high

### 🔒 Privacy & cost
- 🚫 No network by default (only user-initiated feedback)
- 💸 **Zero LLM tokens** spent by the extension — AI helpers are clipboard-only
- 📵 Telemetry off by default; opt-in emits counts only (no source, no paths)

---

## 🌍 Supported languages (19)

| | Language | Parser | Notes |
|---|---|---|---|
| 🟦 | **TypeScript** | `ts-morph` (AST) | Full class/method/arrow support, exports tracked by symbol path |
| 🟨 | **JavaScript** | `ts-morph` (AST) | Same engine as TS; handles `.js`, `.jsx`, `.mjs`, `.cjs` |
| 🐍 | **Python** | indent-aware regex | `def`, `async def`, decorators, dunder methods, docstrings |
| 🐹 | **Go** | brace-balanced regex | `func`, methods, capital-letter export convention, goroutines as async |
| 🎯 | **Dart / Flutter** | brace-balanced regex | Flutter-aware `setState()` mutation detection, `_name` privacy |
| ☕ | **Java** | brace-balanced regex | Annotations, generics, `throws` clauses, shared JVM effect library |
| 🟪 | **Kotlin** | brace-balanced regex | `suspend fun` → async, extension functions, `when` branches |
| 🟩 | **C#** | brace-balanced regex | Records, attributes, expression-bodied members, Unity `MonoBehaviour` |
| 🦀 | **Rust** | brace-balanced regex | `impl` blocks, `unsafe` → mutation, `panic!()` + `Result<T,E>` as throws |
| 🐘 | **PHP** | brace-balanced regex | Visibility modifiers, `throws`, fs / curl / PDO / superglobals |
| 🍎 | **Swift** | brace-balanced regex | Class/struct/enum/actor methods, `async`/`throws`, URLSession/FileManager |
| 📱 | **Objective-C** | brace-balanced regex | `-`/`+` selectors, `@throw`, NSURLSession, NSFileManager |
| 🌙 | **Lua** | block walker | `function name`, `tbl:method`, `do`/`end` walker, `coroutine.yield` |
| 🟥 | **Scala** | brace-balanced regex | `def` + generics, `match`/`for`-comprehensions, `Future`/`IO` → async |
| 💧 | **Elixir** | `do`/`end` walker | `def`/`defp`/`defmacro`, HTTPoison / Tesla / Finch / File / Logger |
| 🔷 | **F#** | indent + brace regex | Functional + OO members, `Async<T>` → async |
| 📈 | **R** | indent + brace regex | `function(…)` definitions, side-effects via `print`/`cat` |
| 🎮 | **GDScript** | indent-aware regex | Godot signals, `func`/`static func`, `_ready` lifecycle hooks |
| 💻 | **PowerShell** | brace-balanced regex | `function`, advanced functions, `[CmdletBinding()]`, pipelines |

> All regex-based parsers are scheduled to move to **tree-sitter WASM grammars** for higher precision (planned, roadmapped).

---

## 📦 Install

### From VSIX (current path)

```bash
pnpm install
pnpm build
pnpm --filter extension package
```

Then in VS Code / Cursor: `Extensions: Install from VSIX…` → pick `extension/impactflow-X.Y.Z.vsix`.

> Marketplace publish is the last roadmap item — install from VSIX until then.

---

## 🛠️ Run locally

Requires **Node ≥ 22** and **pnpm ≥ 9**.

```bash
pnpm install
pnpm dev          # builds extension + webview in watch mode
```

In VS Code, press **F5** → opens an Extension Development Host with ImpactFlow loaded.

### Useful scripts

| Script | What |
|---|---|
| `pnpm lint` | Biome lint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest (102 / 102 passing) |
| `pnpm build` | Production build |
| `pnpm --filter extension package` | Produce `.vsix` |

---

## 🗂️ Layout

```
.
├── extension/        VS Code host (Node + esbuild)
│   ├── src/
│   │   ├── extension.ts             activate / deactivate
│   │   ├── pipeline.ts              change → diff → impact → risk
│   │   ├── parsers/                 per-language extractors (19)
│   │   ├── behavior-diff/           9 detectors
│   │   ├── impact/, risk/           reference walking + scoring
│   │   ├── hotspot/, coverage/, dead-code/, drafts.ts, …
│   │   └── side-panel-provider.ts   webview host
│   └── test/                        Vitest suites
├── webview/          React 19 + Vite 6 + Tailwind 4
└── .github/workflows/ci.yml
```

---

## 🧱 Tech stack

TypeScript 5.7 · Node 22+ · esbuild · React 19 · Vite 6 · Tailwind v4 · `ts-morph` · `simple-git` · Vitest 2 · Biome 1.9

---

## 💬 Feedback

Use the in-extension feedback form (side panel → feedback), or open a GitHub Issue.

## 📄 License

MIT.
