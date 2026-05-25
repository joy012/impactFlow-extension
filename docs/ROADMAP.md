# ImpactFlow — Roadmap (only what's not yet shipped)

> Companion to `DONE.md`. Everything below is **planned but not yet built**.
> Snapshot: **2026-05-25**. **19 languages** and all reviewer features have already shipped — see `DONE.md` for the catalogue.

## At a glance

| # | Block | Status | Effort |
|---|---|---|---|
| 1 | **Instrumentation gates** — full corpus benchmark | 🟡 scaffolded (10 seed examples + `pnpm bench` harness) | ~1 week, mostly labelling |
| 2 | **Tree-sitter migration** — replace all 19 regex parsers with WASM grammars | 🟡 plan only (`docs/TREE-SITTER.md`) | ~2.5–3 weeks |
| 3 | **Audit fixes (30 remaining)** — items from the 36-finding audit not yet patched | 🟡 documented | ~3–5 days total |
| 4 | **Publish prep** — kept LAST per direction | 🟡 untouched | ~½ day |

Total remaining engineering: **~4–5 weeks** if all of (1) (2) (3) ship before (4).

---

## 1. Instrumentation gates (Block A)

**What's there now:** `pnpm bench` harness, 10 labelled examples across 5 languages (`extension/test/corpus/{ts,python,go,java,dart}/*.json`), `extension/test/corpus/README.md` describing the JSON shape.

**What's missing to make the gate real:**

- [ ] **190 more labelled examples** from real OSS PRs, spread across the 19 supported languages
- [ ] **Wire the engine call in `scripts/bench.mjs`** — currently the harness just lists files; it doesn't actually invoke `diffBehavior` and compare against expected diffs
- [ ] **Per-detector precision / recall report** with column-wise breakdown
- [ ] **FP-rate computation** on the `shouldNotEmit` examples
- [ ] **CI gate**: fail the build if precision drops > 2pp vs. a baseline number stored in `corpus/.baseline.json`
- [ ] **Perf benchmark**: clone a reference repo (suggest [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) or similar mid-size TS) at a pinned commit, run the pipeline against it, report p50/p95

Once this lands, the Phase 2 §6.4 / Phase 4 §8.5 gates from the original PRD become measurable instead of aspirational.

---

## 2. Tree-sitter migration (Block G)

**Full plan in `docs/TREE-SITTER.md`.** Summary:

- All 19 current parsers are regex-based — honest but lossy on multi-line strings, template literals, macros, and nested scopes
- Tree-sitter replaces them with a single AST-driven flow + WASM grammars
- Each per-language port = ~half a day after the WASM build pipeline is wired
- VSIX size stays roughly the same (~5 MB) — tree-sitter core + grammars replace ts-morph + TS compiler

**Recommended sequencing:** complete **Block 1 (corpus)** first so we have measurable before/after numbers when switching parsers.

---

## 3. Audit fixes — 30 items still open

From the 36-finding audit (`6 fixed`), these remain. Grouped by severity.

### Security (4)
- **S1** — Web3Forms `access_key` extractable from compiled JS. Mitigation: rotate keys + use domain-restriction in Web3Forms console.
- **S3** — Feedback "attach logs" includes recent log lines which may contain file paths. Fix: scrub paths before submission.
- **S4** — Feedback endpoint relies on TLS only, no SRI / pinning. Acceptable for v1; document.

### Functional bugs (5)
- **B3** — Pre-commit hook is bash-only. Document Windows-without-Git-Bash limitation, or ship a PowerShell variant.
- **B4** — `isGitRepo` cache doesn't invalidate on `git init`. Fix: invalidate on workspace folder change OR every 60s.
- **B5** — F16 focus mode doesn't dim newly-opened editors until next snapshot. Fix: listen to `onDidChangeVisibleTextEditors`.
- **B6** — Multi-root workspaces: only first folder used. Fix: iterate `workspaceFolders`, run pipeline per folder.
- **B7** — F8 branch-compare on disconnected histories. Fix: detect missing merge-base, show explicit "histories are unrelated" message.

### Gaps (10)
- **G2** — Dead-code scan has total timeout but no per-file timeout. Slow LSP can starve the rest. Fix: 5s per-file budget.
- **G3** — `analyzeNow` and `summarizeStaged` not cancellable. Add `withProgress` cancellation tokens.
- **G4** — ~12 features have no unit tests (F2 hotspot, F6 last-touched, F7 hook installer, F8 branch-compare, F9 scan, E1b cleanup, F13 refactor-safety, F15 webhook, F16 focus, F4/F5 drafts, coverage engine). Add at least smoke tests per feature.
- **G5** — `@vscode/test-cli` configured but no integration tests written. At minimum: one E2E test that activates the extension and confirms commands are registered.
- **G6** — Brace-helper doesn't handle template-literal `${...}` braces. Real fix is tree-sitter (Block 2). Interim: track `${` ↔ `}` depth.
- **G7** — Webview's `pnpm test` always passes (no tests). Add a React component test.
- **G8** — `commit-summary.ts` and `drafts.ts` have overlapping logic. Refactor into shared `change-collector.ts`.
- **G10** — No UI to clear past 👎 dismissals. Add a `Reset Dismissals` command.

### Privacy (2)
- **P1** — Webhook payload includes file paths; setting description doesn't mention. Add disclosure to setting docs.

### Polish + docs (9)
- **N1** — Walkthrough markdown is generic placeholder. Marketing pass before publish.
- **N3** — `HotspotEngine` doesn't cache failed git lookups. Add a short-TTL negative cache.
- **N4** — Telemetry events inconsistent (`vscodeVersion` present, `extensionVersion` missing).
- **N5** — F8 branch picker shows refs unsorted. Pin HEAD + current branch at top.
- **N6** — `publisher: "joy012"` and GitHub URL defaults are placeholders. Replace with the real publisher when publishing.
- **N7** — Extension bundle is 5.7 MB due to ts-morph. Tree-sitter (Block 2) fixes this.
- **D1** — Missing `docs/architecture.md` (pipeline shape).
- **D2** — Missing `docs/heuristics.md` (every detector + effect pattern).
- **D3** — Missing `docs/false-positives.md` (how to report + triage SLA).
- **D4** — `CHANGELOG.md` only has 0.0.1 entry. Update as features land.

---

## 4. Publish prep — LAST (Block Z)

> 🟡 **Per user direction, this block runs *after* every other block.** All 1 / 2 / 3 land first; then publish prep; then `vsce publish` / `ovsx publish`.

External actions only (no coding tasks):

1. **Marketplace icon** — add a 128×128 PNG at `extension/media/icon.png` and re-add `"icon": "media/icon.png"` to `extension/package.json`. `vsce` will refuse to publish without one.
2. **VS Code Marketplace publisher** — verify a publisher at <https://aka.ms/vscode-create-publisher>; generate a PAT (Marketplace → Manage scope); `vsce login`.
3. **Open VSX (Cursor / VSCodium)** — sign in at <https://open-vsx.org>; generate access token; store as `OVSX_TOKEN`.
4. **Web3Forms `access_key`** — sign up at <https://web3forms.com> with destination email; paste into `extension/src/feedback/config.ts` **or** set `IMPACTFLOW_WEB3FORMS_KEY` at build time.
5. **Detach into its own git repo** — currently nested inside the parent `Desktop/Development` repo.
6. **Beta cohort** — recruit ~10–25 external developers across the languages we support.
7. **Run the actual publish step:**
   ```bash
   pnpm --filter extension package
   pnpm exec vsce publish --no-dependencies
   pnpm exec ovsx publish impactflow-X.Y.Z.vsix -p $OVSX_TOKEN
   ```
   Full sequence in `PUBLISHING.md`.

---

## AI Cost Policy (still binding)

ImpactFlow makes **zero AI API calls**. F11 "AI prompt" is a clipboard helper — the user pastes it into their own assistant. No provider SDK in dependencies, no API key required, no token spend by the extension. If any future feature ever needs a real LLM call, the rules are:

1. Bring-your-own-key only — no extension-managed backend.
2. Off by default, per-provider opt-in.
3. Rate limit (1 / 60s per feature) + daily cap (default 20) + 2k-token prompt budget + 24h response cache.
4. No background calls — always user-initiated.
5. Local-model parity (Ollama / LM Studio / OpenAI-compatible endpoints).
6. Cancellable mid-flight via `AbortController`.
7. CI test that blocks accidental imports of provider SDKs.

---

## Quick decision tree

- **Want measurable quality numbers before more changes?** → start Block 1 (instrumentation).
- **Want lower false-positive rate + smaller VSIX?** → start Block 2 (tree-sitter).
- **Want to ship to marketplace ASAP?** → start Block 4 (publish), accept that quality numbers stay unmeasured for v1.
- **Want to fix the audit polish before going public?** → Block 3, prioritising B4 / B6 / G2 / G3 (the most user-visible).
