# Changelog

All notable changes to ImpactFlow are documented here. Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Tree-sitter parsers for TypeScript / JavaScript / TSX / JSX / Python (replaces ts-morph + Python indent-regex). Bundle drops `ts-morph` (~5 MB) for ~2.8 MB WASM. Remaining 16 languages tracked in `docs/TREE-SITTER.md`.
- Commands wired into `package.json` + `commands.ts` (previously orphaned code paths):
  - `ImpactFlow: Toggle Focus Mode`
  - `ImpactFlow: Cleanup Dead Code (preview + apply)`
  - `ImpactFlow: Install Pre-Commit Hook (warn / block)` + `Uninstall`
  - `ImpactFlow: Draft Commit Message`
  - `ImpactFlow: Draft PR Description`
  - `ImpactFlow: Reset Dismissals` (audit G10)
- Shared `change-detection/change-collector.ts` — single source for branch-base behavior diffs, consumed by both `commit-summary.ts` and `drafts.ts` (audit G8).
- `behavior-diff/facts-constants.ts` — extracted keyword set + function-node type set from `facts.ts`.
- Phase 0 scaffold: pnpm workspace, extension host (esbuild), webview (Vite + React 19 + Tailwind v4).
- In-extension feedback / issue reporting (Web3Forms + GitHub Issues fallback).
- Walkthrough contribution skeleton.
- Side panel webview view.

### Changed
- Code style pass: stripped JSDoc blocks across all extension source files; kept inline `// why` comments only where the reasoning isn't obvious from the code.
- All exported functions converted to arrow consts; no default exports anywhere in the codebase.
- `parsers/router.ts` refactored into a registry pattern — `EXTENSIONS` regex table + `ADAPTERS` record replace the 19-arm switch statements.
- `Pipeline.analyzeOpenDocuments` now accepts a `CancellationToken` (audit G3); `analyzeNow` and `summarizeStaged` commands wire it through.
- Telemetry events now include `extensionVersion` alongside `vscodeVersion` (audit N4).
- `git-detect.ts` 60-second TTL on cached `.git` lookups so `git init` mid-session is picked up (audit B4); cache also invalidated on `onDidChangeWorkspaceFolders`.
- `focus-mode.ts` subscribes to `onDidChangeVisibleTextEditors` so newly-opened editors dim immediately (audit B5).
- `dead-code/scan.ts` per-file 5-second budget on LSP `executeDocumentSymbolProvider` + `executeReferenceProvider` (audit G2).
- `HotspotEngine` keeps a 30-second negative cache so failed lookups don't keep re-shelling (audit N3).

### Fixed
- All Biome lint errors (43 → 0).
- Several wired commands had `package.json` entries missing — registered via `registerCommands`.

## [0.0.1] — 2026-05-25

Initial scaffold. See [`docs/DONE.md`](docs/DONE.md) for what's built and [`docs/ROADMAP.md`](docs/ROADMAP.md) for what's planned.
