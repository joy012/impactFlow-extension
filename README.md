<div align="center">

# ImpactFlow ⚡

**See what *behavior* changed — not just which files.**

A VS Code / Cursor extension for the AI-assisted coding era, where diffs land faster than humans can read them.

[![tests](https://img.shields.io/badge/tests-142%2B12%20passing-brightgreen)]() [![typecheck](https://img.shields.io/badge/typecheck-clean-brightgreen)]() [![lint](https://img.shields.io/badge/lint-clean-brightgreen)]() [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![local-first](https://img.shields.io/badge/local--first-zero%20network-blue)]()

</div>

---

## The problem

AI assistants produce **large, frequent diffs**. You can't review them at the speed they appear, and the question that actually matters never gets answered:

> *"After this change, what else in my system is going to behave differently?"*

## The answer

For every edit, ImpactFlow tells you in under 400 ms:

| What | Where |
|---|---|
| 🔍 **What behavior changed** | structurally classified — `signature`, `asyncness`, `return_shape`, `branch_logic`, `call_set`, `throw_set`, `side_effect_surface`, `stale_doc`, `complexity_jump` |
| 🌐 **Who depends on it** | callers + tests-to-re-run, split by path heuristics |
| 🎚️ **How risky** | transparent 0–10 score with an explanation array |
| 🌳 **Blast radius** | depth-limited caller tree (markdown + interactive SVG) |
| 📝 **What to commit** | Conventional-Commits subject + structured PR body |

---

## How it compares

| Tool | Answers |
|---|---|
| 🧹 ESLint / Biome | *"Is the syntax valid?"* |
| 🕸️ Madge / Nx | *"Which files import what?"* |
| 🔁 GitLens | *"Who wrote this line?"* |
| 📈 Coverage tools | *"Is this line covered?"* |
| 🤖 Copilot / Cursor | *"Explain this code"* |
| ⚡ **ImpactFlow** | **"What in my running system now behaves differently — and what should I retest *right now*?"** |

GitLens shows blame. VS Code shows coverage. Knip finds dead exports. Copilot drafts commits. **ImpactFlow is the only tool that classifies the diff structurally and feeds that signal into one risk score per modified function — at edit time, not CI time.**

---

## Pipeline at a glance

```
edit  →  parse (tree-sitter)  →  diff (9 detectors)  →  references (LSP)
                                                              │
                                                              ▼
                                                          risk score
                                                              │
                                                              ▼
        ┌───────────────────────────────────────────────────────────────┐
        │  side panel    status bar    gutter dots    caller tree      │
        │  commit/PR     pre-commit    webhook        BYOK AI (opt-in) │
        └───────────────────────────────────────────────────────────────┘
```

All **local by default**. Optional opt-in AI uses your existing VS Code model provider (Copilot, custom Anthropic/OpenAI, local Ollama) via `vscode.lm` — **the extension never sees an API key**.

---

## Features

### Reviewer pack
| | |
|---|---|
| 🔥 **Hotspot** | flags frequently-changed files (90-day git history) |
| 👤 **Last-touched** | most recent author per modified function |
| 📊 **Coverage** | warns when changed code has < 50% coverage (`lcov.info`) |
| 🧩 **Complexity** | `cc N` badge per fn · alerts on jumps ≥ 3 |
| 📚 **Stale-doc** | body changed but JSDoc/docstring didn't |
| 🧪 **Test-impact** | splits callers from *test* callers — tells you exactly what to re-run |
| 💀 **Dead-code report** | workspace-wide unused-symbol scan |
| 🧹 **Dead-code cleanup** | safety-gated preview + apply (fully undoable) |
| 🌿 **Branch compare** | full pipeline between any two refs · detects disconnected histories |
| 🌳 **Caller tree** | markdown command + interactive SVG webview (zoom · pan · depth slider) |
| 📝 **Drafts** | Conventional Commits + structured PR body (deterministic, zero AI tokens) |
| 🪝 **Pre-commit hook** | warn (default) or block · always bypassable with `--no-verify` |
| 📡 **Webhook** | opt-in POST on HIGH-severity diff (metadata only) |
| 🎯 **Focus mode** | dims everything outside ±10 lines of a modified function |

### Side panel
- ⏳ **Animated progress bar** with phase labels (`parsing → diffing → references → risk → rendering`)
- 🎚️ Severity chips + status-bar severity cycler
- ⌨️ **Vim-style keyboard nav** — `j`/`k`/`Enter`/`x`/`?`
- 💾 **Persistent collapse state** per workspace
- 👎 Persistent dismissals · `Reset Dismissals` restores them
- 🎨 Density toggle (`compact` / `comfortable`)
- 📋 **List virtualization** — 5 000 rows at 60 fps

### Inline + status bar
- 🟥🟧🟦 Gutter circles per severity + overview-ruler marks
- 📍 `$(pulse) ImpactFlow: 2 high · 5 med` — warning bg on HIGH
- 📊 Secondary `$(filter) medium` — click cycles severity filter

### 🤖 BYOK AI (opt-in, off by default)

7 commands, all token-aware:

| Command | What it does |
|---|---|
| `AI: Explain Change` | implications + verify checklist + edge cases |
| `AI: Suggest Tests` | 3-6 concrete test cases targeting detected diff types |
| `AI: Review High-Risk` | focused skeptical review (HIGH-severity only) |
| `AI: Update Docs` | regen doc block only — no body, no prose |
| `AI: Why High-Risk?` | 2-3 sentence plain-English risk breakdown (no source sent) |
| `AI: Triage Snapshot` | ranks all modified fns by review priority (no source sent) |
| `AI: Clear Response Cache` | drops cache + rate-limit windows |

**Token economics:**
- 24 h LRU response cache (100 entries) keyed by `fnId + bodyHash + kind` — repeated calls on unchanged code are free
- Snapshot triage cached by ordered snapshot hash
- 1 call per fn per 60 s rate limit
- Hard caps: **2 k prompt + 1 k response tokens**
- Function text trimmed to 1 500 chars before sending
- Streaming preview · cancellable mid-stream

### Privacy & cost

| | |
|---|---|
| 🚫 Network calls | none by default · only user-initiated feedback + opt-in AI |
| 💸 LLM tokens | **zero** unless `impactflow.ai.enable` is `true` AND a `vscode.lm` provider is configured |
| 📵 Telemetry | off by default · opt-in emits counts only (no source, no paths) |
| 🗂️ Multi-root | engines route per file path via `WorkspaceEngineRouter` |
| 🧠 Performance monitor | `ImpactFlow: Perf Diagnostics` — RSS, heap delta, CPU time, p50/p95 per-file |

---

## Supported languages (19)

| Tier | Languages | Parser |
|---|---|---|
| ✅ tree-sitter — npm (15) | TypeScript · JavaScript · TSX · JSX · Python · Go · Java · Kotlin · Rust · C# · PHP · Scala · Elixir · Lua · Objective-C · PowerShell · F# | published WASM packages |
| ✅ tree-sitter — vendored (4) | Dart · Swift · R · GDScript | built in-house with `tree-sitter build --wasm` (emscripten), vendored at `extension/vendor/grammars/` |

---

## Commands

> 💡 Open the command palette (`Cmd/Ctrl + Shift + P`) and type `imp` — VS Code auto-completes all ImpactFlow commands.

| Command | What |
|---|---|
| **Core** | |
| `ImpactFlow: Analyze` | Re-run the pipeline on every open document |
| `ImpactFlow: Summarize Staged` | Markdown PR-style summary against branch base |
| `ImpactFlow: Compare Branches` | Full behavior diff between any two refs |
| `ImpactFlow: Jump to Function` | Quick-pick across modified functions |
| `ImpactFlow: Focus Mode` | Dim lines outside ±10 of modified functions |
| `ImpactFlow: Show Caller Tree (Markdown)` | Caller tree as markdown |
| `ImpactFlow: Show Caller Tree (Visual)` | Interactive SVG tree (zoom + pan + depth slider) |
| **Drafts + hooks** | |
| `ImpactFlow: Draft Commit Msg` / `Draft PR` | Clipboard + preview |
| `ImpactFlow: Install Hook (warn / block)` / `Uninstall Hook` | Pre-commit hook installer |
| **Maintenance** | |
| `ImpactFlow: Find Dead Code` / `Clean Dead Code` | Read-only scan + safety-gated removal |
| `ImpactFlow: Refresh Coverage` | Reload `lcov.info` |
| `ImpactFlow: Cycle Severity Filter` | Cycle all → low → medium → high |
| `ImpactFlow: Reset Baseline` / `Reset Dismissals` | Clear state |
| `ImpactFlow: Perf Diagnostics` | RSS / heap / CPU / p50 / p95 markdown report |
| **AI (BYOK · opt-in)** | |
| `ImpactFlow: AI: Explain Change` / `Suggest Tests` / `Review High-Risk` | Per-fn |
| `ImpactFlow: AI: Update Docs` / `Why High-Risk?` | Per-fn |
| `ImpactFlow: AI: Triage Snapshot` | Snapshot-level |
| `ImpactFlow: AI: Clear Response Cache` | Drop cache |
| **Feedback** | |
| `ImpactFlow: Send Feedback` / `Report Bug` / `Request Feature` | Pre-filled form |

---

## Settings (quick reference)

| Setting | Default | What |
|---|---|---|
| `impactflow.enable` | `true` | Master switch |
| `impactflow.severity.show` | `medium` | Minimum severity in side panel |
| `impactflow.decorations.inline` | `true` | Gutter dots |
| `impactflow.ui.density` | `comfortable` | `compact` (22 px) or `comfortable` (32 px) |
| `impactflow.maxFileSizeKb` | `512` | Skip larger files |
| `impactflow.baseline.inline` | `head` | `head` or `lastSave` |
| `impactflow.baseline.commit` | `branchBase` | `branchBase` or `head` |
| `impactflow.preCommit.mode` | `warn` | `warn` (exit 0) or `block` (exit 1) |
| `impactflow.notify.webhookUrl` | `""` | Opt-in webhook (metadata only) |
| `impactflow.ai.enable` | `false` | Master switch for BYOK AI commands |
| `impactflow.ai.preferredModel` | `""` | `vendor/family` hint (e.g. `copilot/gpt-4o`) |
| `impactflow.ai.cacheTtlHours` | `24` | AI response cache TTL |
| `impactflow.ai.maxPromptTokens` | `2000` | Hard cap |
| `impactflow.ai.maxResponseTokens` | `1000` | Hard cap (estimated, stops stream) |
| `impactflow.ai.rateLimitSeconds` | `60` | Per-fn rate limit |
| `impactflow.telemetry` | `false` | Opt-in usage counts |

Full list: `Cmd+,` → search `impactflow`.

---

## Install

```bash
pnpm install
pnpm build
pnpm --filter extension package
```

Then in VS Code / Cursor: `Extensions: Install from VSIX…` → pick `extension/impactflow-X.Y.Z.vsix`.

> Marketplace publish is the last roadmap item — install from VSIX until then.

---

## Develop

**Requires** Node ≥ 22 and pnpm ≥ 9.

```bash
pnpm install
pnpm dev      # webview + extension in watch mode
```

In VS Code press **F5** to launch an Extension Development Host with ImpactFlow loaded.

| Script | What |
|---|---|
| `pnpm lint` | Biome lint |
| `pnpm typecheck` | `tsc --noEmit` (both packages) |
| `pnpm test` | Vitest — **142 extension · 12 webview** |
| `pnpm bench` | Corpus precision/recall benchmark |
| `pnpm --filter extension test:integration` | `@vscode/test-cli` E2E |
| `pnpm build` | Production bundle + WASM copy |
| `pnpm --filter extension package` | Produce `.vsix` |

---

## Contributing

ImpactFlow is open source (MIT). PRs welcome. Three ways to help:

### 🐛 Found a false positive?
Open an issue with the function source + the diff label ImpactFlow flagged. False positives are the most actionable feedback — they directly tighten the heuristics.

### 🧪 Add a corpus example
The precision gate needs 200 labelled examples; we have 10. Drop a new JSON file in `extension/test/corpus/<lang>/` matching the shape of existing ones. CI re-measures precision on every push.

### 🌍 Port a language to tree-sitter
4 languages (Dart / Swift / R / GDScript) still use regex parsers — they need WASM grammars compatible with web-tree-sitter ≥ 0.26. Port recipe in `docs/ROADMAP.md`.

### Code conventions

| Rule | Enforced by |
|---|---|
| 100-char line, single-quote, trailing comma | Biome |
| Arrow consts over `function` declarations | code review |
| `import type` for type-only imports | Biome `useImportType` |
| No `void promise()` discards | code review |
| No JSDoc unless `// why`-style | code review |
| Inline comments only where reasoning isn't obvious | code review |
| Tests for new pure functions | required |

### Layout

```
.
├── extension/             VS Code host (Node + esbuild)
│   ├── src/
│   │   ├── pipeline.ts            change → diff → impact → risk
│   │   ├── workspace-router.ts    multi-root engine routing
│   │   ├── ai/                    BYOK provider · cache · rate limiter · prompts
│   │   ├── parsers/               19 langs (13 tree-sitter, 6 regex)
│   │   ├── behavior-diff/         9 detectors + facts engine
│   │   ├── impact/                refs · caller tree (markdown + SVG webview)
│   │   ├── risk/                  composite score
│   │   ├── change-detection/      baselines · watcher · change-collector
│   │   ├── git-hooks/             pre-commit installer
│   │   ├── decorations/           gutter circles · overview ruler
│   │   ├── diagnostics.ts         perf monitor (RSS · heap · CPU · p50/p95)
│   │   └── side-panel-provider.ts
│   └── test/
│       ├── *.test.ts              16 vitest files · 142 tests
│       └── integration/           @vscode/test-cli E2E
├── webview/               React 19 + Vite 6 + Tailwind 4
│   └── src/components/
│       ├── SidePanel.tsx          virtualized file list + per-fn cards
│       ├── ProgressBar.tsx        animated phase bar
│       └── utils.ts               12 vitest cases
└── docs/                  internal dev tracking (not shipped to marketplace)
    ├── DONE.md            what's built
    ├── ROADMAP.md         what's remaining + port recipe
    └── PUBLISHING.md      release ops
```

---

## Tech stack

TypeScript 5.7 · Node 22 · esbuild · React 19 · Vite 6 · Tailwind v4 · web-tree-sitter 0.26 · @tanstack/react-virtual · simple-git · Vitest 2 · Biome 1.9

## License

[MIT](LICENSE)
