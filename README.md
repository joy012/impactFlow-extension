# ImpactFlow

> Behavioral change intelligence for AI-assisted development.

ImpactFlow is a VS Code / Cursor extension that tells you **what behavior changed in your system** after you modify code — not just *what files depend on what*. It is built for the era where AI generates code faster than humans can review it.

> Status: see [`docs/DONE.md`](docs/DONE.md) for what's built (55/55 tests, packaged VSIX) and [`docs/ROADMAP.md`](docs/ROADMAP.md) for what's planned.

---

## Why

Modern AI-assisted coding (Cursor, Copilot, Claude) produces large, frequent diffs. Existing tools answer the wrong question:

- Linters check syntax.
- Dependency graphs show structure.
- AI assistants explain code but not system-wide impact.

ImpactFlow answers: **"after this change, what other behavior in my system is likely affected?"**

## How it works (high level)

```
edit → change detection → AST diff (ts-morph) → behavior diff engine
     → impact propagation → risk scoring → side panel + inline hints
```

All analysis is **local**. No source code leaves your machine.

## Tech stack

- TypeScript 5.7, Node 22+
- Extension host bundled with esbuild
- Side panel: React 19 + Vite 6 + Tailwind CSS v4
- AST: ts-morph
- Lint/format: Biome
- Tests: Vitest + `@vscode/test-cli`

## Project layout

```
.
├── extension/      # VS Code extension host (Node + esbuild)
├── webview/        # Side-panel UI (React 19 + Vite 6 + Tailwind v4)
└── docs/
    ├── DONE.md       # What's built
    ├── ROADMAP.md    # What's planned
    └── PUBLISHING.md # Marketplace publish steps
```

## Development

Requires Node ≥ 22 and pnpm ≥ 9.

```bash
pnpm install
pnpm dev               # builds extension + webview in watch mode
```

Then in VS Code, press `F5` to launch an Extension Development Host with ImpactFlow loaded.

## Roadmap

Phases 0–6, 7a (Python), and 8 are shipped — see [`docs/DONE.md`](docs/DONE.md). Remaining work — Go, Java, Kotlin, C#, Rust, tree-sitter upgrade, Reviewer Pack (hotspots / last-touched / branch-vs-branch), Team Pack (webhook notify / focus mode), and publish prep — is in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Feedback

The extension ships an in-product feedback form (see the "In-extension feedback" section of [`docs/DONE.md`](docs/DONE.md)). For development, file issues directly on GitHub.

## License

MIT.
