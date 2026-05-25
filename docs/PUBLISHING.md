# Publishing ImpactFlow

This document covers the manual steps needed before/around publishing to the VS Code Marketplace and Open VSX (which Cursor / VSCodium read).

> Status: **Pre-publish.** The build produces a valid `.vsix`, but the marketplace publisher account, Web3Forms key, and CI release tag flow still need a human one-time setup.

---

## 1. One-time setup

### 1.1 VS Code Marketplace publisher
1. Create / verify a publisher at <https://aka.ms/vscode-create-publisher>. The publisher ID must match the `publisher` field in `extension/package.json` (currently `joy012`).
2. Create a Personal Access Token (PAT) with `Marketplace → Manage` scope at <https://dev.azure.com>.
3. Store it locally: `vsce login joy012` (it will prompt for the PAT).

### 1.2 Open VSX (for Cursor / VSCodium users)
1. Sign in at <https://open-vsx.org> via GitHub.
2. Generate a token under "Access Tokens".
3. Set it as a GitHub secret named `OVSX_TOKEN` for CI publishing (optional — manual publish also works).

### 1.3 Feedback endpoint (Web3Forms)
1. Visit <https://web3forms.com>, enter the destination email (the one you want feedback to land in).
2. Receive your `access_key`.
3. Paste it into `extension/src/feedback/config.ts`, replacing `REPLACE_WITH_YOUR_WEB3FORMS_ACCESS_KEY`, **or** set the env var `IMPACTFLOW_WEB3FORMS_KEY` at build time so the key never lands in git.

### 1.4 Telemetry (optional)
- The telemetry channel is **opt-in** for end users via the `impactflow.telemetry` setting.
- If you want telemetry data: provision Application Insights, get a connection string, and set `IMPACTFLOW_TELEMETRY_KEY` at build time. Without it, telemetry is a logged no-op.

---

## 2. Local release flow

```bash
# 1. Sanity gate (already wired into CI)
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build

# 2. Bump version
#    (edit extension/package.json + root package.json + CHANGELOG.md)

# 3. Package
pnpm --filter extension package
#    → produces extension/impactflow-0.X.Y.vsix

# 4. Publish to VS Code Marketplace
cd extension
pnpm exec vsce publish --no-dependencies
# or: pnpm exec vsce publish 0.X.Y --no-dependencies

# 5. Publish to Open VSX (Cursor users live here)
pnpm exec ovsx publish impactflow-0.X.Y.vsix -p $OVSX_TOKEN

# 6. Tag the release
git tag v0.X.Y && git push origin v0.X.Y
```

The `--no-dependencies` flag is important: vsce would otherwise try to resolve our pnpm workspace dependencies; we bundle everything with esbuild already.

---

## 3. What CI does for you

`.github/workflows/ci.yml` runs on every PR + main push:
- `pnpm install --frozen-lockfile`
- `pnpm lint` (Biome)
- `pnpm typecheck` (tsc --noEmit, both packages)
- `pnpm test` (Vitest)
- `pnpm build` (Vite + esbuild)
- On Ubuntu only: `pnpm --filter extension package` → uploads the `.vsix` as an artifact retained for 30 days.

For tag-pushed releases you can wire a second workflow (`release.yml`) that calls `vsce publish` + `ovsx publish` using `VSCE_PAT` / `OVSX_TOKEN` repo secrets. That step is deliberately not automated yet because it should only run once you have the publisher accounts set up.

---

## 4. Pre-publish checklist

- [ ] Publisher name matches `extension/package.json` `publisher`.
- [ ] `extension/media/icon.png` exists (128×128 PNG). Currently absent — add one or remove from package.json.
- [ ] Web3Forms `access_key` configured (else feedback falls back to GitHub Issues).
- [ ] `impactflow.feedback.githubIssuesUrl` points at the real repo URL.
- [ ] README marketplace listing reviewed in the `vsce package` output (drag the .vsix into <https://marketplace.visualstudio.com/manage> to preview).
- [ ] LICENSE present (MIT, included).
- [ ] CHANGELOG.md updated for the new version.
- [ ] Smoke-tested in VS Code stable AND latest Cursor.

---

## 5. Cursor smoke-test (one minute)

1. Install the `.vsix` in Cursor: `cmd + shift + p` → "Install from VSIX".
2. Open a TS project, edit a function.
3. Confirm side panel renders, gutter dots appear, status bar updates.
4. Run `ImpactFlow: Send Feedback` — confirm the form opens.
5. Note any visual differences from VS Code in `docs/cursor-smoketest.md`.
