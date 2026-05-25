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
- ⏳ **Shows live progress** — animated phase bar + pulse dot while the pipeline runs

All **local**. **No network. No AI tokens. No accounts.**

---

## 🆚 Why not just use AI / a linter / a dep graph?

| Tool | Answers |
|---|---|
| 🧹 Linters (ESLint, Biome) | "Is the syntax valid?" |
| 🕸️ Dep graphs (Madge, Nx) | "Which files import what?" |
| 🤖 Copilot / Cursor / Claude | "Explain this code" |
| 🔁 GitLens | "Who wrote this line?" |
| 📈 Coverage tools | "Is this line covered?" |
| ⚡ **ImpactFlow** | **"What in my running system now behaves differently — and what should I retest?"** |

GitLens shows blame. VS Code shows coverage. Knip finds dead exports. Copilot drafts commits. ImpactFlow is the only tool that **classifies the diff structurally** (`signature`, `asyncness`, `return_shape`, `throw_set`, `side_effect_surface`, `branch_logic`, `call_set`, `stale_doc`, `complexity_jump`) and feeds that signal into a single risk score per modified function — at edit time, not CI time.

---

## ✨ Features

### Reviewer pack
- 🔥 **Hotspot map** — flags frequently-changed files (90-day git history)
- 👤 **Last-touched badge** — most recent author per modified function
- 📊 **Coverage cross-check** — warns when changed code has < 50% coverage (reads `lcov.info`)
- 🧩 **Complexity badge** — `cc N` per function, alerts on jumps ≥ 3
- 📚 **Stale-doc detector** — body changed but JSDoc/docstring didn't
- 🧪 **Test-impact predictor** — splits callers from *test* callers; tells you exactly what to re-run
- 💀 **Dead-code report** — workspace-wide unused-symbol scan
- 🧹 **Dead-code cleanup** — safety-gated preview + apply (fully undoable)
- 🌿 **Branch-vs-branch compare** — full pipeline between any two refs · detects disconnected histories
- 🔁 **Refactor-safety helper** — rename candidates via LSP
- 📝 **Commit + PR drafts** — Conventional Commits + structured PR body (deterministic, zero token cost)
- 🪝 **Pre-commit hook** — warn (default) or block; always bypassable with `--no-verify`
- 📡 **Webhook on high-risk** — opt-in POST (metadata only, no source)
- 🎯 **Focus mode** — dims everything not within ±10 lines of a modified function

### Side panel
- ⏳ Animated progress bar with phase labels (`parsing → diffing → references → risk → rendering`)
- 🎚️ Severity chips (all / medium / high)
- 👆 Click-to-reveal navigation
- 👎 Persistent dismissals · `Reset Dismissals` command to restore them
- 🎨 Auto light / dark / high-contrast theme · `compact` / `comfortable` density setting

### Inline + status bar
- 🟥🟧🟦 Gutter circles per severity + overview-ruler marks
- 📍 Status bar `$(pulse) ImpactFlow: 2 high · 5 med` — warning color on high

### 🔒 Privacy & cost
- 🚫 No network by default (only user-initiated feedback)
- 💸 **Zero LLM tokens** spent by the extension
- 📵 Telemetry off by default; opt-in emits counts only (no source, no paths)
- 🗂️ Multi-root workspaces — engines route per file path

---

## 🌍 Supported languages (19)

| | Language | Parser | Notes |
|---|---|---|---|
| 🟦 | **TypeScript / TSX** | tree-sitter | Class/method/arrow/default-export, accessors qualified |
| 🟨 | **JavaScript / JSX** | tree-sitter | Shares TS grammar (JSX built in) |
| 🐍 | **Python** | tree-sitter | `def`, `async def`, decorators, dunder methods, docstrings |
| 🐹 | **Go** | tree-sitter | `func`, methods qualified by receiver, capital-letter exports |
| ☕ | **Java** | tree-sitter | Classes, interfaces, records, enums, modifiers |
| 🟪 | **Kotlin** | tree-sitter | `fun`, classes, objects, `private`/`internal` visibility |
| 🦀 | **Rust** | tree-sitter | `fn`, `impl` block routing, `pub` visibility |
| 🟩 | **C#** | tree-sitter | Methods, constructors, records, namespaces |
| 🐘 | **PHP** | tree-sitter | Functions + methods, visibility modifiers |
| 🟥 | **Scala** | tree-sitter | `def`, classes, objects, traits |
| 📱 | **Objective-C** | tree-sitter | Class implementations, multi-part selectors |
| 🌙 | **Lua** | tree-sitter | `function name`, `tbl:method`, `local function` private detection |
| 💧 | **Elixir** | tree-sitter | `defmodule`/`def`/`defp`/`defmacro`, guards, do-blocks |
| 🎯 | **Dart / Flutter** | regex (brace-balanced) | `setState()` mutation, `_name` privacy |
| 🍎 | **Swift** | regex (brace-balanced) | Class/struct/enum/actor methods, `async`/`throws` |
| 🔷 | **F#** | regex (indent + brace) | Functional + OO members, `Async<T>` → async |
| 📈 | **R** | regex (indent + brace) | `function(…)` definitions, side-effects via `print`/`cat` |
| 🎮 | **GDScript** | regex (indent-aware) | Godot signals, `func`/`static func` |
| 💻 | **PowerShell** | regex (brace-balanced) | `function`, advanced functions, `[CmdletBinding()]` |

> **13 of 19 languages** are on tree-sitter (WASM grammars, higher precision). The remaining 6 use regex parsers — the WASM packages for those grammars are either unmaintained on npm or built against an older tree-sitter ABI that isn't compatible with web-tree-sitter ≥ 0.26. See [`docs/TREE-SITTER.md`](docs/TREE-SITTER.md).

---

## 🎛️ Commands (18)

| Command | What it does |
|---|---|
| `ImpactFlow: Analyze Changes Now` | Re-run the pipeline on every open document |
| `ImpactFlow: Summarize Staged Changes` | Markdown PR-style summary against branch base |
| `ImpactFlow: Compare Branches` | Full behavior diff between any two refs |
| `ImpactFlow: Toggle Focus Mode` | Dim lines outside ±10 of modified functions |
| `ImpactFlow: Find Dead Code` | Workspace-wide unused-export scan (read-only) |
| `ImpactFlow: Cleanup Dead Code (preview + apply)` | Safety-gated, undoable removal flow |
| `ImpactFlow: Refresh Coverage` | Reload `lcov.info` and re-render coverage badges |
| `ImpactFlow: Draft Commit Message` | Conventional-Commits style → clipboard |
| `ImpactFlow: Draft PR Description` | Structured markdown → clipboard + preview |
| `ImpactFlow: Install Pre-Commit Hook (warn / block)` | Install the bash hook in either mode |
| `ImpactFlow: Uninstall Pre-Commit Hook` | Remove only the managed block |
| `ImpactFlow: Reset Baseline` | Drop snapshots, re-analyze |
| `ImpactFlow: Reset Dismissals` | Restore previously dismissed findings |
| `ImpactFlow: Show Performance Diagnostics` | p50 / p95 / last-sample analysis time |
| `ImpactFlow: Send Feedback` / `Report a Bug` / `Request a Feature` | Open the form pre-filled |

---

## ⚙️ Settings

| Setting | Default | What it does |
|---|---|---|
| `impactflow.enable` | `true` | Master switch |
| `impactflow.languages` | (19 langs) | Language IDs to analyze |
| `impactflow.include` / `exclude` | (sensible globs) | File filter |
| `impactflow.baseline.inline` | `head` | `head` or `lastSave` for live diffs |
| `impactflow.baseline.commit` | `branchBase` | `branchBase` or `head` for summaries |
| `impactflow.severity.show` | `medium` | Minimum severity shown in side panel |
| `impactflow.decorations.inline` | `true` | Gutter dots |
| `impactflow.ui.density` | `comfortable` | `compact` or `comfortable` row height |
| `impactflow.maxFileSizeKb` | `512` | Skip files larger than this |
| `impactflow.cleanup.requireGitClean` | `true` | Cleanup refuses dirty trees |
| `impactflow.cleanup.preserveGlob` | (12 entries) | Globs the cleanup will never offer to remove |
| `impactflow.notify.webhookUrl` | `""` | POSTed when a HIGH-severity diff lands |
| `impactflow.preCommit.mode` | `warn` | `warn` or `block` for the pre-commit hook |
| `impactflow.telemetry` | `false` | Opt-in usage counts |
| `impactflow.feedback.*` | — | Endpoint, GitHub fallback URL, env attach |

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
| `pnpm typecheck` | `tsc --noEmit` (both packages) |
| `pnpm test` | Vitest (100 / 100 passing) |
| `pnpm bench` | Run the corpus precision/recall benchmark |
| `pnpm build` | Production build (webview + esbuild bundle + WASM copy) |
| `pnpm --filter extension package` | Produce `.vsix` |

---

## 🗂️ Layout

```
.
├── extension/        VS Code host (Node + esbuild)
│   ├── src/
│   │   ├── extension.ts             activate / deactivate
│   │   ├── pipeline.ts              change → diff → impact → risk
│   │   ├── workspace-router.ts      per-folder engine routing (multi-root)
│   │   ├── change-detection/        baseline, watcher, change-collector
│   │   ├── parsers/                 per-language extractors (19)
│   │   │   └── tree-sitter/         13 tree-sitter extractors + grammar cache
│   │   ├── behavior-diff/           9 detectors + facts engine
│   │   ├── impact/, risk/           reference walking + scoring
│   │   ├── hotspot/, coverage/, dead-code/, drafts.ts
│   │   ├── focus-mode.ts, webhook.ts, git-hooks/
│   │   └── side-panel-provider.ts   webview host
│   ├── scripts/copy-grammars.mjs    bundles WASM into dist/grammars
│   └── test/                        Vitest suites + corpus
├── webview/          React 19 + Vite 6 + Tailwind 4
│   └── src/components/
│       ├── SidePanel.tsx            file list + per-fn cards
│       ├── ProgressBar.tsx          animated phase bar + pulse dot
│       └── FeedbackForm.tsx
└── docs/             ROADMAP, DONE, TREE-SITTER, PUBLISHING
```

---

## 🧱 Tech stack

TypeScript 5.7 · Node 22+ · esbuild · **web-tree-sitter 0.26** (13 grammars) · React 19 · Vite 6 · Tailwind v4 · `simple-git` · Vitest 2 · Biome 1.9

---

## 💬 Feedback

Use the in-extension feedback form (side panel → feedback tab), or open a GitHub Issue.

## 📄 License

MIT.
