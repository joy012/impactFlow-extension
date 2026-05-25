import { relative } from 'node:path';
import * as vscode from 'vscode';
import type { DeadCodeReport } from './dead-code/scan.js';
import type { DiagnosticsSnapshot } from './diagnostics.js';
import { logger } from './logger.js';

type Inbound =
  | { type: 'reveal'; payload: { filePath: string; line: number } }
  | { type: 'runCommand'; payload: { command: string } };

interface DeadCodeView {
  kind: 'dead-code';
  report: DeadCodeReport;
  workspaceRoot: string;
}

interface PerfView {
  kind: 'perf';
  snap: DiagnosticsSnapshot;
}

type View = DeadCodeView | PerfView;

// Single reusable webview-panel renderer for non-list reports (dead-code,
// perf-diagnostics). Replaces the previous .md-document path because raw
// markdown couldn't show interactive chips, CTA buttons, or grouped cards.
export const showReportPanel = (ctx: vscode.ExtensionContext, view: View): vscode.WebviewPanel => {
  const title = view.kind === 'dead-code' ? 'ImpactFlow — Dead Code' : 'ImpactFlow — Performance';
  const panel = vscode.window.createWebviewPanel(
    `impactflow.report.${view.kind}`,
    title,
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.webview.html = renderHtml(view);
  panel.webview.onDidReceiveMessage(async (msg: Inbound) => {
    try {
      if (msg.type === 'reveal') {
        const uri = vscode.Uri.file(msg.payload.filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        const line = Math.max(0, msg.payload.line - 1);
        const pos = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      } else if (msg.type === 'runCommand') {
        await vscode.commands.executeCommand(msg.payload.command);
      }
    } catch (err) {
      logger.warn(`report-panel message failed: ${(err as Error).message}`);
    }
  });
  ctx.subscriptions.push(panel);
  return panel;
};

const renderHtml = (view: View): string => {
  const body = view.kind === 'dead-code' ? renderDeadCodeBody(view) : renderPerfBody(view);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<style>${REPORT_CSS}</style>
</head>
<body>
${body}
<script>${REPORT_JS}</script>
</body>
</html>`;
};

const renderDeadCodeBody = (v: DeadCodeView): string => {
  const { report, workspaceRoot } = v;
  const grouped = groupByFile(report.findings, workspaceRoot);
  const findingsCount = report.findings.length;
  const fileCount = grouped.length;

  return `
<header class="rp-header">
  <div class="rp-brand">
    <span class="rp-glyph"><span class="rp-glyph-ring"></span><span class="rp-glyph-core"></span></span>
    <div>
      <h1>Dead Code</h1>
      <p class="rp-sub">${esc(`${findingsCount} candidate${findingsCount === 1 ? '' : 's'} across ${fileCount} file${fileCount === 1 ? '' : 's'} · scanned ${report.scanned} files in ${report.durationMs} ms`)}</p>
    </div>
  </div>
  ${
    findingsCount > 0
      ? `<button class="rp-cta" data-cmd="impactflow.cleanupDeadCode">Run safe cleanup…</button>`
      : ''
  }
</header>

<section class="rp-stats">
  <div class="rp-stat">
    <div class="rp-stat-value">${findingsCount}</div>
    <div class="rp-stat-label">candidates</div>
  </div>
  <div class="rp-stat">
    <div class="rp-stat-value">${fileCount}</div>
    <div class="rp-stat-label">files</div>
  </div>
  <div class="rp-stat">
    <div class="rp-stat-value">${report.scanned}</div>
    <div class="rp-stat-label">scanned</div>
  </div>
  <div class="rp-stat">
    <div class="rp-stat-value">${report.skipped.length}</div>
    <div class="rp-stat-label">skipped</div>
  </div>
</section>

<main class="rp-main">
${
  findingsCount === 0
    ? `<div class="rp-empty"><strong>No dead exports detected.</strong><p>You're clean.</p></div>`
    : grouped
        .map(
          (g) => `
  <article class="rp-card">
    <header class="rp-card-head">
      <span class="rp-file" title="${esc(g.filePath)}">${esc(g.shortPath)}</span>
      <span class="rp-count">${g.items.length}</span>
    </header>
    <ul class="rp-list">
      ${g.items
        .map(
          (f) => `
        <li class="rp-row" data-file="${esc(f.filePath)}" data-line="${f.line}">
          <span class="rp-kind">${esc(kindBadge(f.kind))}</span>
          <span class="rp-sym">${esc(f.symbol)}</span>
          <span class="rp-line">L${f.line}</span>
        </li>`,
        )
        .join('')}
    </ul>
  </article>`,
        )
        .join('')
}
${
  report.skipped.length > 0
    ? `
<details class="rp-skipped">
  <summary>${report.skipped.length} file${report.skipped.length === 1 ? '' : 's'} skipped</summary>
  <ul>${report.skipped
    .slice(0, 50)
    .map((s) => `<li>${esc(shorten(s.filePath, workspaceRoot))} — <em>${esc(s.reason)}</em></li>`)
    .join('')}</ul>
</details>`
    : ''
}
</main>

<footer class="rp-footer">Click any row to open at line · cleanup runs in a single, undoable edit</footer>
`;
};

const renderPerfBody = (v: PerfView): string => {
  const { snap } = v;
  const { mem, cpu, perf } = snap;
  const heapDeltaSign = mem.deltaSinceActivationMb >= 0 ? '+' : '';
  const heapColor =
    mem.deltaSinceActivationMb > 80
      ? 'rp-bad'
      : mem.deltaSinceActivationMb > 40
        ? 'rp-warn'
        : 'rp-ok';
  const p95Color = perf.p95 > 250 ? 'rp-bad' : perf.p95 > 100 ? 'rp-warn' : 'rp-ok';

  return `
<header class="rp-header">
  <div class="rp-brand">
    <span class="rp-glyph"><span class="rp-glyph-ring"></span><span class="rp-glyph-core"></span></span>
    <div>
      <h1>Performance</h1>
      <p class="rp-sub">Uptime ${esc(snap.uptime)} · captured ${esc(new Date(snap.generatedAt).toLocaleTimeString())}</p>
    </div>
  </div>
  <button class="rp-cta rp-cta-ghost" data-cmd="impactflow.resetBaseline">Reset baseline</button>
</header>

<section class="rp-stats rp-stats-4">
  <div class="rp-stat ${heapColor}">
    <div class="rp-stat-value">${heapDeltaSign}${mem.deltaSinceActivationMb}<small>MB</small></div>
    <div class="rp-stat-label">heap Δ since activate</div>
  </div>
  <div class="rp-stat">
    <div class="rp-stat-value">${mem.heapUsedMb}<small>MB</small></div>
    <div class="rp-stat-label">heap used (of ${mem.heapTotalMb})</div>
  </div>
  <div class="rp-stat ${p95Color}">
    <div class="rp-stat-value">${perf.p95.toFixed(0)}<small>ms</small></div>
    <div class="rp-stat-label">p95 per-file</div>
  </div>
  <div class="rp-stat">
    <div class="rp-stat-value">${perf.p50.toFixed(0)}<small>ms</small></div>
    <div class="rp-stat-label">p50 per-file</div>
  </div>
</section>

<main class="rp-main">
  <article class="rp-card">
    <header class="rp-card-head"><span class="rp-file">Process</span></header>
    <ul class="rp-kv">
      <li><span>RSS (total process)</span><strong>${mem.rssMb} MB</strong></li>
      <li><span>External (Buffers / wasm)</span><strong>${mem.externalMb} MB</strong></li>
      <li><span>ArrayBuffers</span><strong>${mem.arrayBuffersMb} MB</strong></li>
      <li><span>CPU user since activation</span><strong>${cpu.userSec} s</strong></li>
      <li><span>CPU system since activation</span><strong>${cpu.systemSec} s</strong></li>
    </ul>
  </article>
  <article class="rp-card">
    <header class="rp-card-head"><span class="rp-file">Pipeline</span></header>
    <ul class="rp-kv">
      <li><span>Samples collected</span><strong>${perf.samples}</strong></li>
      <li><span>Last analysis</span><strong>${perf.last == null ? '–' : `${perf.last.toFixed(1)} ms`}</strong></li>
      <li><span>Open workspace folders</span><strong>${snap.folderCount}</strong></li>
    </ul>
  </article>
</main>

<footer class="rp-footer">Heap Δ &gt; 80 MB or p95 &gt; 250 ms → file an issue with this snapshot</footer>
`;
};

// ── styling ─────────────────────────────────────────────────────────────────

const REPORT_CSS = `
:root { color-scheme: var(--vscode-colorScheme, dark light); }
html, body { margin: 0; padding: 0; background: var(--vscode-editor-background); color: var(--vscode-foreground); font: var(--vscode-font-size, 13px)/1.5 var(--vscode-font-family); }
body { padding: 20px 24px 32px; max-width: 980px; margin: 0 auto; }
.rp-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 16px; border-bottom: 1px solid color-mix(in srgb, var(--vscode-foreground) 12%, transparent); }
.rp-brand { display: flex; align-items: center; gap: 12px; }
.rp-brand h1 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
.rp-sub { margin: 2px 0 0; font-size: 11.5px; color: var(--vscode-descriptionForeground); }
.rp-glyph { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 999px; background: color-mix(in srgb, var(--vscode-button-background) 14%, transparent); border: 1px solid color-mix(in srgb, var(--vscode-button-background) 28%, transparent); }
.rp-glyph-ring { position: absolute; inset: 4px; border: 1.5px solid color-mix(in srgb, var(--vscode-button-background) 50%, transparent); border-radius: 999px; }
.rp-glyph-core { position: relative; width: 7px; height: 7px; border-radius: 999px; background: var(--vscode-button-background); }
.rp-cta { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; padding: 7px 14px; border-radius: 6px; font: inherit; font-weight: 600; cursor: pointer; }
.rp-cta:hover { background: var(--vscode-button-hoverBackground); }
.rp-cta-ghost { background: transparent; color: var(--vscode-foreground); border: 1px solid color-mix(in srgb, var(--vscode-foreground) 18%, transparent); }
.rp-cta-ghost:hover { background: color-mix(in srgb, var(--vscode-foreground) 6%, transparent); }
.rp-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0 20px; }
.rp-stat { border: 1px solid color-mix(in srgb, var(--vscode-foreground) 10%, transparent); background: color-mix(in srgb, var(--vscode-foreground) 4%, transparent); border-radius: 10px; padding: 12px 14px; }
.rp-stat-value { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; line-height: 1; }
.rp-stat-value small { font-size: 11px; font-weight: 600; margin-left: 2px; color: var(--vscode-descriptionForeground); }
.rp-stat-label { margin-top: 6px; font-size: 10.5px; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.08em; }
.rp-bad { border-color: color-mix(in srgb, var(--vscode-errorForeground) 35%, transparent); background: color-mix(in srgb, var(--vscode-errorForeground) 10%, transparent); }
.rp-bad .rp-stat-value { color: var(--vscode-errorForeground); }
.rp-warn { border-color: color-mix(in srgb, var(--vscode-editorWarning-foreground, #d4a72c) 35%, transparent); background: color-mix(in srgb, var(--vscode-editorWarning-foreground, #d4a72c) 10%, transparent); }
.rp-warn .rp-stat-value { color: var(--vscode-editorWarning-foreground, #d4a72c); }
.rp-ok { border-color: color-mix(in srgb, var(--vscode-testing-iconPassed, #4caf50) 28%, transparent); background: color-mix(in srgb, var(--vscode-testing-iconPassed, #4caf50) 8%, transparent); }
.rp-main { display: flex; flex-direction: column; gap: 12px; }
.rp-card { border: 1px solid color-mix(in srgb, var(--vscode-foreground) 10%, transparent); border-radius: 10px; overflow: hidden; background: color-mix(in srgb, var(--vscode-foreground) 2%, transparent); }
.rp-card-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: color-mix(in srgb, var(--vscode-foreground) 5%, transparent); }
.rp-file { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; color: var(--vscode-foreground); }
.rp-count { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--vscode-errorForeground) 18%, transparent); color: var(--vscode-errorForeground); }
.rp-list { list-style: none; margin: 0; padding: 4px 0; }
.rp-row { display: grid; grid-template-columns: 60px 1fr auto; gap: 10px; align-items: center; padding: 6px 14px; cursor: pointer; }
.rp-row:hover { background: color-mix(in srgb, var(--vscode-button-background) 10%, transparent); }
.rp-kind { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--vscode-descriptionForeground); padding: 2px 6px; border-radius: 4px; background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent); text-align: center; }
.rp-sym { font-family: var(--vscode-editor-font-family, monospace); font-size: 12.5px; }
.rp-line { font-size: 11px; color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
.rp-kv { list-style: none; margin: 0; padding: 4px 0; }
.rp-kv li { display: flex; justify-content: space-between; padding: 7px 14px; border-top: 1px solid color-mix(in srgb, var(--vscode-foreground) 6%, transparent); }
.rp-kv li:first-child { border-top: 0; }
.rp-kv li span { color: var(--vscode-descriptionForeground); font-size: 12px; }
.rp-kv li strong { font-weight: 600; font-variant-numeric: tabular-nums; }
.rp-empty { text-align: center; padding: 40px 20px; color: var(--vscode-descriptionForeground); }
.rp-empty strong { display: block; color: var(--vscode-foreground); font-size: 14px; margin-bottom: 4px; }
.rp-skipped { margin-top: 8px; border: 1px solid color-mix(in srgb, var(--vscode-foreground) 10%, transparent); border-radius: 8px; padding: 8px 14px; font-size: 11px; }
.rp-skipped summary { cursor: pointer; color: var(--vscode-descriptionForeground); }
.rp-skipped ul { margin: 8px 0 0; padding-left: 16px; color: var(--vscode-descriptionForeground); }
.rp-footer { margin-top: 20px; padding-top: 16px; border-top: 1px solid color-mix(in srgb, var(--vscode-foreground) 10%, transparent); font-size: 11px; color: var(--vscode-descriptionForeground); text-align: center; }
`;

const REPORT_JS = `
const vscode = acquireVsCodeApi();
for (const row of document.querySelectorAll('.rp-row')) {
  row.addEventListener('click', () => {
    vscode.postMessage({ type: 'reveal', payload: { filePath: row.dataset.file, line: Number(row.dataset.line) } });
  });
}
for (const btn of document.querySelectorAll('[data-cmd]')) {
  btn.addEventListener('click', () => {
    vscode.postMessage({ type: 'runCommand', payload: { command: btn.dataset.cmd } });
  });
}
`;

// ── helpers ─────────────────────────────────────────────────────────────────

const groupByFile = (
  findings: DeadCodeReport['findings'],
  root: string,
): Array<{ filePath: string; shortPath: string; items: DeadCodeReport['findings'] }> => {
  const map = new Map<string, DeadCodeReport['findings']>();
  for (const f of findings) {
    const arr = map.get(f.filePath) ?? [];
    arr.push(f);
    map.set(f.filePath, arr);
  }
  return [...map.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([filePath, items]) => ({
      filePath,
      shortPath: shorten(filePath, root),
      items: items.sort((a, b) => a.line - b.line),
    }));
};

const shorten = (abs: string, root: string): string =>
  abs.startsWith(root) ? relative(root, abs) : abs.split(/[\\/]/).slice(-3).join('/');

const kindBadge = (kind: string): string => {
  // Compact tag from VS Code's SymbolKind enum names.
  if (kind === 'Function') return 'fn';
  if (kind === 'Method') return 'meth';
  if (kind === 'Constructor') return 'ctor';
  return kind.slice(0, 4).toLowerCase();
};

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
