# ImpactFlow — Completed Work

> Snapshot: **2026-05-25** · **102/102 tests passing** · VSIX 1.57 MB · zero typecheck errors.
>
> See `ROADMAP.md` for what's still planned (tree-sitter + publish only).

---

## Headline numbers

| Check | Result |
|---|---|
| Test suite | **102/102** across 10 files |
| Typecheck (tsc) | 0 errors, both `extension/` and `webview/` packages |
| Build | extension host 5.7 MB · webview ~210 KB (gz ~65 KB) |
| Packaged | `extension/impactflow-0.0.1.vsix` (98 files, 1.57 MB) |
| **Languages — 19** | TypeScript · JavaScript · Python · Go · Dart · Java · Kotlin · C# · Rust · PHP · Swift · Objective-C · Lua · Scala · Elixir · **F# · R · GDScript · PowerShell** |
| Reviewer features | hotspot 🔥 · coverage % · dead-code report · **dead-code cleanup (preview + apply)** · branch-vs-branch · last-touched @badges · stale-doc · complexity-jump · AI-prompt copy · test-impact predictor · commit-message draft · PR-description draft · pre-commit hook (warn/block, fully bypassable) · webhook notify · **focus mode** |
| Commands | 17 (Analyze · Summarize Staged · Compare Branches · Draft Commit Msg · Draft PR · Install/Uninstall Pre-Commit Hook · Find Dead Code · Cleanup Dead Code · Refresh Coverage · Toggle Focus Mode · Reset Baseline · Show Perf · Send Feedback · Report Bug · Request Feature · Analyze Now) |
| No-git fallback | banner in side panel + every git-dependent command degrades gracefully |
| AI tokens spent by the extension | **Zero** — see Roadmap §Y. AI Cost Policy |

---

## Architecture (locked stack)

**Toolchain:** Node 22+, pnpm 9, TypeScript 5.7, Biome 1.9 (single tool for lint + format).

**Extension host:** esbuild bundle · `vscode` engine `^1.95` · `ts-morph` 24 for TS/JS AST · `simple-git` 3 · `workspaceState` + on-disk JSON cache · opt-in `@vscode/extension-telemetry` stub.

**Webview UI:** Vite 6 · React 19 · Tailwind CSS v4 via `@tailwindcss/vite` · VS Code CSS custom properties mapped to Tailwind tokens (auto light/dark/high-contrast).

**Tests:** Vitest 2 for unit · `@vscode/test-cli` configured (no integration tests written yet).

**Privacy posture:** zero-network by default. The only outbound traffic is user-initiated feedback submissions (§ Feedback feature). Telemetry off by default, opt-in only.

---

## Phase 0 — Foundations & Setup ✅

- pnpm workspace with two packages: `extension/` (host) + `webview/` (React UI)
- Shared `tsconfig.base.json`, root `biome.json`, root `package.json` with pinned scripts
- esbuild config for the extension host (CJS, target node22, externalizes `vscode`)
- Vite config for the webview (browser target, asset rewriting for VS Code's `vscode-webview://`)
- `extension/scripts/copy-webview.mjs` — copies `webview/dist` → `extension/dist/webview` so the VSIX bundles everything
- `.vscode/launch.json` + `tasks.json` — F5 launches Extension Development Host with preLaunchTask
- CSP + nonce wiring in the side-panel webview renderer
- `.gitignore`, `.vscodeignore`, `.npmrc`, `LICENSE` (MIT), `CHANGELOG.md`, `README.md`
- Activity-bar SVG icon (ripple/wave shape)
- Walkthrough markdown files (`intro.md`, `try-it.md`, `feedback.md`)

---

## Phase 1 — Change Detection + AST Spine ✅

- `extension/src/parsers/typescript/function-table.ts` — ts-morph walk extracting top-level functions, class methods, constructors, accessors, arrow assignments, default exports. Stable IDs by symbol path (not line number). Body hashing strips comments + whitespace.
- `extension/src/parsers/typescript/diff-functions.ts` — added / removed / modified set diff.
- `extension/src/change-detection/baseline.ts` — `GitHeadBaseline` (`git show HEAD:<file>`) and `EmptyBaseline` fallback.
- `extension/src/change-detection/watcher.ts` — debounced `workspace.onDidChangeTextDocument` (400 ms), plus immediate fire on save/open. Coalesces in-flight analysis to prevent overlapping passes.
- `extension/src/pipeline.ts` — orchestrates change → baseline → parse → diff → snapshot emission. Perf samples (p50/p95) exposed via `ImpactFlow: Show Performance Diagnostics` command.
- Side panel renders Added/Modified/Removed lists per file with click-to-reveal.
- **10 unit tests** for the function-table extractor.

---

## Phase 2 — Behavior Diff Engine ✅ (corpus gate unmeasured)

- `extension/src/behavior-diff/effect-patterns.ts` — pattern library: network (fetch/axios/http), fs (fs.*/fs/promises), env (process.env), DOM, globals, console.
- `extension/src/behavior-diff/facts.ts` — extracts `FnFacts` from a function's text: paramSig, returnType, isAsync, isGenerator, returnExprs, callSites, throws, branchConditions, effects, identifier-stripped structural skeleton, cyclomatic complexity.
- `extension/src/behavior-diff/index.ts` — 7 detectors:
  - `signature` (high)
  - `asyncness` (high)
  - `return_shape` (medium/high)
  - `branch_logic` (medium)
  - `call_set` (medium)
  - `throw_set` (medium)
  - `side_effect_surface` (medium)
  - Plus 2 cross-cutting detectors added in Phase 8: `stale_doc`, `complexity_jump`.
- **Pure-rename / formatting filter** — short-circuits to zero diffs when skeleton + metadata match.
- **13 unit tests** covering every detector class.

**Caveat:** the 200-example labeled corpus from `ROADMAP.md` §Corpus is *not built*; only ~13 in-code examples exist. The ≥80% precision gate has not been measured against real OSS PRs.

---

## Phase 3 — Impact Propagation + Risk Scoring ✅

- `extension/src/impact/references.ts` — finds call sites via VS Code's built-in `vscode.executeReferenceProvider`. Sidesteps the need for a separate workspace-wide ts-morph Project, and inherits accuracy from whichever language server the user has installed.
- `extension/src/risk/formula.ts` — composite score per PLAN §7.3:
  ```
  risk = clamp(
      severityWeight(topSeverity)
    + 2 * isPublicSurface
    + log2(1 + impactedCount)
    + 1 * crossesPackageBoundary
    + 1 * touchesAsyncBoundary
  , 0, 10)
  ```
- Bucket: 0-1 safe · 2-3 low · 4-6 medium · 7-10 high. Transparent — explanation array surfaced in the side panel.
- `extension/src/change-detection/baseline.ts` adds `BranchBaseBaseline` (`merge-base HEAD main|master|trunk`).
- `extension/src/commit-summary.ts` + command `ImpactFlow: Summarize Staged Changes` — opens a markdown preview of behavior diffs against the branch base, ready to paste into a PR description.
- **6 unit tests** for the risk formula.

---

## Phase 4 — False-Positive Control ✅ (FP gate unmeasured)

- `extension/src/filters.ts` — tier assignment:
  - **Likely:** max confidence ≥ 0.7, OR ≥ 0.4 AND severity ≥ medium
  - **Possible:** everything else, plus dead-code demotion (unexported + zero callers)
- Severity threshold setting (`impactflow.severity.show`) actually applied in the pipeline.
- `extension/src/storage/feedback-store.ts` — persistent 👎 dismissals via `workspaceState` (capped at 200 entries).
- Dismissed findings filtered out of subsequent snapshots; user can clear via re-edit / reset baseline command.
- **8 unit tests** for tier picking + severity threshold.

---

## Phase 5 — UX, Onboarding, Configuration ✅

- `extension/src/decorations/inline.ts` — gutter circle decorations (red/amber/blue) per severity, plus overview-ruler marks; respects `impactflow.decorations.inline` setting.
- `extension/src/status-bar.ts` — status bar item (`$(pulse) ImpactFlow: 2 high · 5 med`) with warning background when any HIGH change is present. Click → opens side panel.
- Severity filter chips (all / medium / high) in the side panel header.
- Real implementations of `Show Perf` (returns p50/p95) and `Reset Baseline` (clears snapshots and re-analyzes).
- All settings declared in `extension/package.json` `contributes.configuration`:
  - `impactflow.enable`, `languages`, `include`, `exclude`
  - `impactflow.baseline.inline`, `impactflow.baseline.commit`
  - `impactflow.severity.show`, `decorations.inline`
  - `impactflow.telemetry` (off by default)
  - `impactflow.feedback.{enable,endpoint,includeEnv,githubIssuesUrl}`
- Walkthrough contribution with 3 steps wired through `contributes.walkthroughs`.

---

## Phase 6 — Telemetry + CI + Publish prep 🟡 partial

**Done:**
- `extension/src/telemetry/index.ts` — opt-in scaffold reading `impactflow.telemetry` setting. Refreshes on config change. No-ops when off or when no connection-string env var was provided at build time. Sends `extension.activated` and `analysis.completed` events when enabled.
- `.github/workflows/ci.yml` — Ubuntu + macOS matrix on Node 22; lint, typecheck, test, build, package; uploads VSIX as 30-day artifact.
- `extension/.vscode-test.mjs` — `@vscode/test-cli` config for future integration tests.
- `PUBLISHING.md` — end-to-end one-time setup instructions for VS Code Marketplace + Open VSX + Web3Forms + telemetry.

**Deferred per user direction (see `ROADMAP.md`):**
- Marketplace icon PNG (128×128).
- Publisher account + PAT for `vsce`.
- Open VSX token.
- Web3Forms `access_key` (feedback falls back to GitHub Issues without it).
- Beta cohort recruitment.
- Actual `vsce publish` call.

---

## Phase 7b — Go support ✅

- `extension/src/parsers/brace-helper.ts` — shared brace-balanced extractor (Go, Dart, Java, Kotlin, future C#/Rust). Walks past `// `, `/* */`, `""`, `''`, backtick strings.
- `extension/src/parsers/go/function-table.ts` — extracts `func F()` and `func (r *R) M()`. Qualifies methods by receiver type. Captures `// doc` lines. Uses Go's capital-letter export convention.
- `extension/src/parsers/go/facts.ts` — Go-specific facts: paramSig, return type, `go ...` as async-ish proxy, `panic()` + multi-value `return ..., err` as throws-proxy, effect patterns (`http.*`, `os.*`, `fmt.Print*`, `log.*`, `exec.Command`).
- **8 Go tests** covering extraction, methods, exports, doc capture, async, panic/err throws, network/console effects, end-to-end signature diff.

## Phase 7c — Dart / Flutter support ✅

- `extension/src/parsers/dart/function-table.ts` — top-level functions, class methods, factory constructors, getters/setters, async/Future/Stream shapes. Recognizes `_name` private convention, captures `///` doc + decorators.
- `extension/src/parsers/dart/facts.ts` — **Flutter-aware `setState()` → mutation** effect, `http.*`, `Dio()`, `dart:io`, `Platform.environment`, `print`/`developer.log`.
- **7 Dart tests** including extraction, async return types, setState detection, network effects, async-ness change.

## Phase 7d — Java + Kotlin (shared JVM) ✅

- `extension/src/parsers/jvm/effect-patterns.ts` — shared JVM effect library (HttpClient, RestTemplate, File/Files, System.{getenv,getProperty}, ProcessBuilder, Logger, JDBC).
- **Java** (`parsers/java/{function-table,facts}.ts`): regex extraction handling annotations, modifiers, generics, `throws` clauses; statement-keyword filter prevents `if/while` from being mistaken for functions; `throws` clause + `throw new X(...)` both feed the throws-diff detector. 4 tests.
- **Kotlin** (`parsers/kotlin/{function-table,facts}.ts`): handles `fun`, `suspend fun`, extension functions, generics; `suspend` detected as async-ness; `when` blocks recognized as branch conditions; private/internal correctly map to `isExported=false`. 5 tests.

## Phase 7f — Tier 3 languages (Swift · Objective-C · Lua · Scala · Elixir) ✅

- **Swift** (`parsers/swift/{function-table,facts}.ts`) — class/struct/enum/protocol/extension/actor methods, async/throws shapes, URLSession/FileManager/print/NSLog effects, property-wrapper-aware skeleton.
- **Objective-C** (`parsers/objc/{function-table,facts}.ts`) — `-`/`+` method signatures with multi-part selectors, `@implementation`/`@end` block tracking, NSURLSession/NSFileManager/NSLog effects, `@throw` + `NSException` raise detection.
- **Lua** (`parsers/lua/{function-table,facts}.ts`) — `function name`/`function tbl:method`/`local function`, balanced `do`/`if`/`for`/`while`/`function` ↔ `end` block walker, `coroutine.yield` → generator, `io.*` / `os.*` / `HttpService:GetAsync` effects.
- **Scala** (`parsers/scala/{function-table,facts}.ts`) — `def` with generics + return type, class/object/trait scope tracking, `match`/`for-comprehension`/`when` as branches, reuses the shared JVM effect library, `Future[T]`/`IO[T]` → async.
- **Elixir** (`parsers/elixir/{function-table,facts}.ts`) — `def`/`defp`/`defmacro` within `defmodule`, `do`↔`end` block walker, `defp` private detection, HTTPoison/Tesla/Finch + File + Logger effects.
- **8 tier-3 tests** covering extraction, exports, effects across Swift/Lua/Elixir.

## Phase 8c — Dead-code cleanup + Focus mode ✅

### E1b · Dead-code cleanup (preview + apply)
- `extension/src/dead-code/cleanup.ts` — full safety-gated removal flow per `docs/ROADMAP.md §E1`:
  - Rule 1: workspace must be a git repo (per `git-detect.ts`).
  - Rule 2: working tree must be clean (configurable via `impactflow.cleanup.requireGitClean`).
  - Rule 3: candidate file is NOT in `impactflow.cleanup.preserveGlob` (12 sensible defaults including `**/pages/**`, `**/api/**`, `**/*.gen.*`, `**/generated/**`).
  - Rule 4: file has no dynamic-access patterns (`eval`, `getattr`, `Reflect.*`, `require(var)`, etc).
  - Rule 5: user selects each item via multi-select Quick Pick.
  - Rule 6: modal confirmation before any edit.
  - Rule 7: one `WorkspaceEdit` — fully undoable with `cmd+z`.
- Symbol-precise deletion via `executeDocumentSymbolProvider`; fallback is line-only.
- Command: `ImpactFlow: Cleanup Dead Code (preview + apply)`.

### F16 · Focus mode
- `extension/src/focus-mode.ts` — toggle command that dims every line in every visible editor that's NOT within ±10 lines of a currently-modified or added function.
- Stays in sync with snapshot updates.
- Command: `ImpactFlow: Toggle Focus Mode`.

## Phase 7e — C# + Rust + PHP ✅

- **C#** (`extension/src/parsers/csharp/{function-table,facts}.ts`) — methods, constructors, properties, records, attributes (`[HttpGet]`/`[SerializeField]`), async/Task/ValueTask, expression-bodied members. Effect patterns include Unity's `MonoBehaviour`. 4 tests.
- **Rust** (`extension/src/parsers/rust/{function-table,facts}.ts`) — `fn`, `async fn`, `impl` block tracking, `pub` exports, `panic!()` + `Result<T,E>` as throws-proxy, `unsafe` → mutation effect, `println!`/`reqwest`/`tokio` patterns. Macros deliberately treated as call-sites without expansion. 3 tests.
- **PHP** (`extension/src/parsers/php/{function-table,facts}.ts`) — top-level + class functions, visibility modifiers, throws-class detection, effects for fs / curl / `$_ENV` / superglobals / `echo` / PDO. 2 tests.

## Phase 9 (continued) — Reviewer Pack ✅

### F4 · Commit-message draft
- `extension/src/drafts.ts::draftCommitMessage` — heuristic Conventional-Commits-style subject + per-fn bullet list + risk roll-up; copies to clipboard.
- Command: `ImpactFlow: Draft Commit Message`.

### F5 · PR-description draft
- `draftPrDescription` — structured Summary / Risk / High-risk / Medium-risk / Test plan markdown. Opens in markdown preview AND copies to clipboard.
- Command: `ImpactFlow: Draft PR Description`.

### F7 · Pre-commit guard (safe + bypassable)
- `extension/src/git-hooks/pre-commit.ts` — installs `.git/hooks/pre-commit` with sentinel-bracketed managed block so existing hooks are preserved. **Default mode: warn (exit 0)**. User can opt into `block` via `impactflow.preCommit.mode` setting. **Always bypassable** via `git commit --no-verify`.
- Pure-bash hook; doesn't load the Node bundle, so commits stay fast.
- Uninstall command cleanly removes only the managed portion.
- Commands: `ImpactFlow: Install Pre-Commit Hook`, `ImpactFlow: Uninstall Pre-Commit Hook`.

### F13 · Refactor-safety helper
- `extension/src/refactor-safety.ts` — `detectRenameCandidate` + `runGuidedRename` delegating to `vscode.executeDocumentRenameProvider`. Module is ready; CodeAction wiring comes in the next push.

## Phase 10 (started) — Team / Outbound ✅

### F15 · Webhook notify on high-risk
- `extension/src/webhook.ts` — fires from the snapshot listener when any HIGH-severity diff is present. Opt-in via `impactflow.notify.webhookUrl` (empty = disabled). Throttled to 1 POST per fn per 5 min.
- Payload is one-line JSON with severity / fn name / file / risk score / caller count / timestamp. No source code.

## No-git fallback ✅

Asked: "if no git is present, how does the git flow look?" — every git-dependent feature now degrades cleanly.

- `extension/src/git-detect.ts` — single source of truth for "is this folder a git repo?". Cached, recomputed on workspace change. Handles `.git/` as both directory (normal repo) and file (worktree / submodule).
- `InitPayload.isGitRepo` is shipped to the webview so the UI can adapt.
- **Side-panel banner** at the top when no `.git/` is detected, explaining which features need git.
- **Empty state** distinguishes "no changes since HEAD" (with git) vs "open a git repo to begin" (without).
- **Every git-using command** shows an explicit warning toast instead of failing silently.
- **Engines** (`HotspotEngine`, `LastTouchedEngine`, `BranchBaseBaseline`) all wrap `simpleGit()` in try/catch and return null/empty — never crash.

## Phase 8b — Hotspot, Coverage, Dead-code ✅

### F2 · Hotspot map
- `extension/src/hotspot/index.ts` — `git log --follow --numstat --since=<90d>` per file, normalized 0..1 score, LRU-capped at 500 files.
- UI: 🔥 badge on changed functions when their file's score ≥ 0.6.

### F10 · Coverage cross-check
- `extension/src/coverage/lcov.ts` — auto-detects `coverage/lcov.info` (and common alternates), live-reloads via `FileSystemWatcher`, per-function line-range coverage %.
- UI: `cov N%` warning badge when coverage < 50%.
- Command: `ImpactFlow: Refresh Coverage`.

### F9 · Dead-code report (E1a read-only)
- `extension/src/dead-code/scan.ts` — workspace-wide LSP-driven scan, 60 s timeout, cancellable, markdown report with skipped-files reasons.
- E1b (preview + apply with safety rules) is intentionally deferred per `ROADMAP.md` §E1.
- Command: `ImpactFlow: Find Dead Code`.

## Phase 9 (partial) — Reviewer Pack ✅

### F8 · Branch-vs-branch compare
- `extension/src/branch-compare.ts` — QuickPick for source + target refs, merge-base computed via git, full pipeline applied to every changed file, structured markdown report.
- Cancellable progress, graceful errors when git unavailable.
- Command: `ImpactFlow: Compare Branches`.

### F6 · Last-touched badge
- `extension/src/git-blame/last-touched.ts` — runs `git log -L <start>,<end>:<file>` per modified function to find its most recent commit. LRU-capped at 500 entries.
- `FnSummary` carries `lastTouched: { sha, author, isoDate }`.
- UI: `@INITIALS` badge with hover tooltip showing full sha + author + ISO date.

## Audit + scalability passes ✅

Tightenings applied during the same push:
- **LRU caps** on snapshot map (200), hotspot cache (500), last-touched cache (500). Long sessions can't grow state unbounded.
- **Happy + sad path coverage** for every user-triggered command — every command warns on missing prerequisites and error-toasts on failure.
- **No hardcoded user data** in user-facing paths — feedback endpoint, GitHub URL, telemetry key, Web3Forms key are all settings or env vars with documented defaults.
- **Telemetry stays opt-in + minimal** — only ships `extension.activated` and `analysis.completed { fileCount, durationMs, high/medium/low }`. No source, paths, identifiers, or diff content.
- **AI token guarantee** documented in `ROADMAP.md` §Y. The extension makes **zero** AI API calls; F11 is a clipboard-only helper; no provider SDK is in dependencies. CI lint rule planned to block accidental imports.

## Phase 7a — Python support ✅

- `extension/src/parsers/python/function-table.ts` — regex + indentation-aware extractor that handles `def`, `async def`, decorated functions, class methods, dunder methods (treated as public surface). Body bounded by indentation. Decorators + docstrings captured for stale-doc detection.
- `extension/src/parsers/python/facts.ts` — Python-flavoured `FnFacts`: regex over the function text to extract paramSig, return type annotation, async-ness, generator (yield presence), return exprs, throws (`raise`), call sites, branch conditions, complexity, and effects.
- Python-specific effect patterns: `requests/urllib/httpx/aiohttp`, `open()`, `os.environ`, `subprocess`, `print`, `logging`, `global`, `setattr`.
- `extension/src/parsers/router.ts` — dispatches by file extension. `languageFor("foo.py") === 'python'`; downstream `diffBehavior`, `findReferences`, `computeRisk`, `pickTier` are unchanged (language-agnostic).
- `impactflow.languages` default now includes `python`.
- **10 unit tests** covering top-level defs, async defs, class methods, exported convention (`_name` private), decorator capture, async / signature / side-effect change detection.

**Limit:** regex-based, not full AST. Tree-sitter upgrade planned in `ROADMAP.md`.

---

## Phase 8 — Daily Driver Bundle ✅

Four high-impact features that drop directly into the existing pipeline.

### F1 · Stale-doc detector
When a function body changes but the JSDoc/docstring above it does not, emit a `stale_doc` diff (low severity, high confidence). Works for both TS/JS (`/** */` JSDoc) and Python (decorators + triple-quoted docstrings).

### F3 · Test-impact predictor
Splits `findReferences` results into `impacted` and `impactedTests`. Tests are detected via path patterns: `*.test.*`, `*.spec.*`, `__tests__`, `test/`, `spec/`, `e2e/`, Go's `_test.go`, Python's `test_*.py` / `*_test.py`. Side panel shows a separate "Tests to re-run (N)" section per modified function.

### F11 · AI prompt copy button
`extension/src/ai-prompt.ts` generates a Claude/Copilot/Cursor-ready markdown prompt for any modified function: describes the detected behavioral changes, lists impacted callers and tests, and asks the AI to verify contract preservation. Triggered via the ✨ button per function in the side panel; copies to clipboard via `vscode.env.clipboard.writeText`.

### F12 · Cyclomatic complexity badge + jump detector
`FnFacts.complexity` is computed during fact extraction (base 1 + branches + catch clauses + `&&`/`||` operators). Functions with complexity > 10 show a `cc<N>` badge in the side panel. A `complexity_jump` diff fires (medium severity, 0.9 confidence) when complexity rose ≥ 3 between baseline and current.

**8 unit tests** for the bundle.

---

## In-extension feedback ✅

- `extension/src/feedback/index.ts` — submits feedback to a configurable HTTPS endpoint (Web3Forms by default). Falls back to a pre-filled GitHub Issue URL if the endpoint is unreachable or the access-key is not configured. Rate-limited to 1 submission / 60 s via `workspaceState`.
- Webview form: type (bug / feature / general), title, description, repro steps (bug only), optional email, attach-logs and attach-env opt-ins. Explicit consent line: *"this will be sent over HTTPS to the maintainer."*
- Three commands: `Send Feedback`, `Report a Bug`, `Request a Feature` — each prefills the form's type.

---

## File tree

```
impactFlow-extension/
├── DONE.md                            this file
├── ROADMAP.md                         remaining phases + plans
├── PUBLISHING.md                      one-time setup for marketplace publish
├── README.md, LICENSE, CHANGELOG.md
├── package.json, pnpm-workspace.yaml  pnpm root + workspace
├── biome.json, tsconfig.base.json
├── .vscode/                           F5 launch + build task
├── .github/workflows/ci.yml           Ubuntu + macOS matrix
├── extension/                         host (Node, esbuild → 5.7 MB)
│   ├── package.json                   commands · views · settings · walkthrough
│   ├── esbuild.config.mjs, scripts/copy-webview.mjs
│   ├── media/{activitybar.svg, walkthrough/*.md}
│   ├── .vscode-test.mjs               integration test config
│   └── src/
│       ├── extension.ts               activate / deactivate
│       ├── commands.ts                7 registered commands
│       ├── side-panel-provider.ts     webview provider + message routing
│       ├── pipeline.ts                change → diff → impact → risk
│       ├── ai-prompt.ts               F11 template generator
│       ├── commit-summary.ts          markdown PR-style summary
│       ├── logger.ts, status-bar.ts
│       ├── filters.ts                 tier picking + severity threshold
│       ├── shared/messages.ts         host ↔ webview contract
│       ├── change-detection/{baseline,watcher}.ts
│       ├── parsers/
│       │   ├── router.ts              dispatch by file extension
│       │   ├── typescript/{function-table,diff-functions}.ts
│       │   └── python/{function-table,facts}.ts
│       ├── behavior-diff/{index,facts,effect-patterns}.ts
│       ├── impact/references.ts
│       ├── risk/{formula,index}.ts
│       ├── decorations/inline.ts
│       ├── feedback/{index,config}.ts
│       ├── telemetry/index.ts
│       └── storage/feedback-store.ts
├── webview/                           React 19 + Vite 6 + Tailwind 4
│   ├── package.json, vite.config.ts, tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx, App.tsx, vscode.ts, styles.css
│       ├── shared/messages.ts         mirror of extension/src/shared/messages.ts
│       └── components/{SidePanel,FeedbackForm,EmptyState}.tsx
└── extension/test/                    Vitest unit suites (55 tests)
    ├── function-table.test.ts (10)
    ├── behavior-diff.test.ts (13)
    ├── risk.test.ts (6)
    ├── filters.test.ts (8)
    ├── phase8.test.ts (8)
    └── python.test.ts (10)
```
