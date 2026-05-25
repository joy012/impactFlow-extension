# Changelog

All notable changes to ImpactFlow are documented here. Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Impact Tree MVP** — new command `ImpactFlow: Show Caller Tree`. Builds a depth-limited (default 2, node-cap 200) transitive caller tree via `vscode.executeReferenceProvider`, renders as a markdown preview. Cycle-safe + cancellable. Full webview SVG tree is the v0.2 follow-up (`ROADMAP.md §1`).
- **UX backlog: keyboard nav + persistent collapse + status-bar cycler + palette quick-jump:**
  - `j` / `k` / `↓` / `↑` move the selection cursor in the side panel, `Enter` opens at line, `x` dismisses, `?` shows shortcuts
  - Selected row scrolls into view; selection survives across snapshots
  - Per-workspace persistent collapse state via `workspaceState` (capped at 500 entries)
  - Second status-bar item `$(filter) <severity>` whose click cycles all → low → medium → high
  - New `ImpactFlow: Jump to Function` and `ImpactFlow: Cycle Severity Filter` palette commands
  - No-git empty state and "compare branches" CTA when there are no changes
  - Density-aware row styling via `[data-density]` attribute (already had the setting)
  - Webview theme audit: every color now flows through `--vscode-*` tokens or `ThemeColor`; the only literal hex left is the SVG gutter fill (renderer can't read tokens)
- **AI integration (BYOK)** via `vscode.lm` Language Model API — the user picks their model in VS Code settings (Copilot, custom Anthropic/OpenAI providers, local Ollama). Extension never sees an API key.
  - 4 new commands: `AI: Explain Change`, `AI: Suggest Tests`, `AI: Review High-Risk Change`, `AI: Clear Response Cache`
  - 6 new settings: `impactflow.ai.enable` (default off), `preferredModel`, `cacheTtlHours`, `maxPromptTokens`, `maxResponseTokens`, `rateLimitSeconds`
  - Token-aware: LRU cache (100 entries × 24 h default) keyed by `fnId + bodyHash + kind`, rate limiter (1 call / fn / 60 s), prompt cap (2 k tokens), response cap (1 k tokens)
  - Streams responses live into a markdown preview tab; cancellable via VS Code's progress UI
  - Quick Pick over the snapshot's modified functions if no function is in focus
  - 10 unit tests covering cache TTL/LRU, rate limiter, prompt builders
- **Tree-sitter for 13 languages** — TypeScript / JavaScript / TSX / JSX / Python / Go / Java / Kotlin / Rust / C# / PHP / Scala / Elixir / Lua / Objective-C. Bundle dropped `ts-morph` (~5 MB) in exchange for the WASM grammars. 6 languages (Dart, Swift, F#, R, GDScript, PowerShell) remain on regex parsers because no maintained `web-tree-sitter ≥ 0.26`-compatible WASM exists for them.
- **Multi-root workspace routing** — new `WorkspaceEngineRouter` keeps a `HotspotEngine` / `LastTouchedEngine` / `CoverageEngine` per workspace folder and routes by file path (audit B6).
- **Animated progress UI** in the side panel — phase bar (`parsing → diffing → references → risk → rendering`) + shimmer + pulsing status dot, debounced so short bursts still register visually.
- **9 previously-orphaned commands wired** into `package.json` + `commands.ts`:
  - `ImpactFlow: Toggle Focus Mode`
  - `ImpactFlow: Cleanup Dead Code (preview + apply)`
  - `ImpactFlow: Install / Uninstall Pre-Commit Hook` (warn / block)
  - `ImpactFlow: Draft Commit Message`
  - `ImpactFlow: Draft PR Description`
  - `ImpactFlow: Reset Dismissals` (audit G10)
- **Disconnected-history detection** in `Compare Branches` — explicit message instead of silent fallback when `git merge-base` returns empty (audit B7).
- **Per-folder coverage + new settings**: `impactflow.ui.density`, `impactflow.maxFileSizeKb`, `impactflow.cleanup.requireGitClean`, `impactflow.cleanup.preserveGlob`, `impactflow.notify.webhookUrl`, `impactflow.preCommit.mode`.
- Shared `change-detection/change-collector.ts` consumed by both `commit-summary.ts` and `drafts.ts` (audit G8 — removed duplicated branch-base diff loops).
- `behavior-diff/facts-constants.ts` — extracted keyword set + function-node type set from `facts.ts`.
- Walkthrough markdown rewritten for clarity (audit N1).

### Changed
- **Shortened all command titles** for a cleaner palette experience: `Analyze Changes Now` → `Analyze`, `Toggle Focus Mode` → `Focus Mode`, `Cleanup Dead Code (preview + apply)` → `Clean Dead Code`, `Show Performance Diagnostics` → `Perf Diagnostics`, `Install Pre-Commit Hook (warn)` → `Install Hook (warn)`, etc. `ImpactFlow:` category prefix kept for brand recognition.
- Code style pass: stripped JSDoc blocks across all extension source files; kept inline `// why` comments only where the reasoning isn't obvious. All exported functions converted to arrow consts; no default exports anywhere.
- `parsers/router.ts` refactored into a registry pattern — `EXTENSIONS` regex table + `ADAPTERS` record replace the 19-arm switch statements.
- `Pipeline.analyzeOpenDocuments` accepts a `CancellationToken` (audit G3); `analyzeNow` + `summarizeStaged` commands thread one through `withProgress`.
- Telemetry events now carry `extensionVersion` alongside `vscodeVersion` (audit N4).
- `git-detect.ts` 60-second TTL on cached `.git` lookups + invalidation on `onDidChangeWorkspaceFolders` (audit B4).
- `focus-mode.ts` subscribes to `onDidChangeVisibleTextEditors` so newly-opened editors dim immediately (audit B5).
- `dead-code/scan.ts` per-file 5-second budget on LSP queries via a `withTimeout` wrapper (audit G2).
- `HotspotEngine` 30-second negative cache for failed lookups (audit N3).
- `Compare Branches` ref picker pins HEAD + current branch at the top (audit N5).
- Pre-commit hook builder uses template literals (small cleanup).
- Replaced `void promise()` fire-and-forget pattern across the codebase with explicit `.catch()` handlers logging at the appropriate level.
- Dropped `: void` arrow-return annotations where TypeScript can infer the type.

### Removed
- **F11 AI prompt copy feature** — Cursor / Copilot Chat already see the code, so the structured-prompt clipboard helper was dead weight in practice. `ai-prompt.ts`, the `aiPromptForFn` message type, the button in the side panel, and the 2 unit tests all deleted.
- Pre-existing regex parsers for languages that moved to tree-sitter (Go / Java / Kotlin / Rust / C# / PHP / Scala / Elixir / Lua / Objective-C).
- Outdated `void join;` no-op in `dead-code/cleanup.ts`; the unused `join` import was deleted.

### Fixed
- 43 Biome lint errors → 0 (mix of formatting and template-literal preferences).
- Several commands existed in source but weren't reachable from the palette — now registered properly.

## [0.0.1] — 2026-05-25

Initial scaffold. See [`docs/DONE.md`](docs/DONE.md) for what's built and [`docs/ROADMAP.md`](docs/ROADMAP.md) for what's planned.
