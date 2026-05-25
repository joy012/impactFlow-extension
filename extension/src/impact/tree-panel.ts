import * as vscode from 'vscode';
import { logger } from '../logger.js';
import { type LaidOutNode, flatten, layoutTree } from './tree-layout.js';
import { type CallerTreeOptions, buildCallerTree } from './tree.js';

type InboundMessage =
  | { type: 'reveal'; payload: { filePath: string; line: number } }
  | { type: 'changeDepth'; payload: { depth: number } };

// Block T — full SVG webview for the caller tree. Opens as a regular editor tab
// (WebviewPanel) so the user can pin it next to the source file.

export const showCallerTreePanel = async (
  ctx: vscode.ExtensionContext,
  opts: CallerTreeOptions,
): Promise<void> => {
  const panel = vscode.window.createWebviewPanel(
    'impactflow.callerTree',
    `ImpactFlow — ${opts.fnName}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  const render = async (depth: number) => {
    const tree = await buildCallerTree({ ...opts, maxDepth: depth });
    const laid = layoutTree(tree);
    const flat = flatten(laid);
    panel.webview.html = renderHtml(flat, opts.fnName, depth);
  };

  panel.webview.onDidReceiveMessage((msg: InboundMessage) => {
    if (msg.type === 'reveal') {
      vscode.workspace
        .openTextDocument(vscode.Uri.file(msg.payload.filePath))
        .then((doc) => vscode.window.showTextDocument(doc, { preview: false }))
        .then((editor) => {
          const pos = new vscode.Position(Math.max(0, msg.payload.line - 1), 0);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        })
        .then(undefined, (err) =>
          logger.warn(`tree-panel reveal failed: ${(err as Error).message}`),
        );
      return;
    }
    if (msg.type === 'changeDepth') {
      render(msg.payload.depth).catch((err) =>
        logger.warn(`tree-panel re-render failed: ${(err as Error).message}`),
      );
    }
  });

  ctx.subscriptions.push(panel);
  await render(opts.maxDepth ?? 2);
};

const renderHtml = (
  flat: {
    nodes: LaidOutNode[];
    edges: Array<{ from: LaidOutNode; to: LaidOutNode }>;
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
  },
  rootName: string,
  depth: number,
): string => {
  const NODE_W = 140;
  const NODE_H = 36;
  const { minX, maxX, minY, maxY } = flat.bounds;
  const padding = 40;
  const vbWidth = Math.max(400, maxX - minX + padding * 2);
  const vbHeight = Math.max(200, maxY - minY + padding * 2);
  const vbX = minX - padding;
  const vbY = minY - padding;

  const escapeAttr = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  const edges = flat.edges
    .map(({ from, to }) => {
      const x1 = from.x;
      const y1 = from.y + NODE_H;
      const x2 = to.x;
      const y2 = to.y;
      // Smooth cubic between parent bottom and child top.
      const cy = (y1 + y2) / 2;
      return `<path class="edge" d="M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}" />`;
    })
    .join('\n');

  const nodes = flat.nodes
    .map((n) => {
      const x = n.x - NODE_W / 2;
      const y = n.y;
      const label = escapeAttr(truncate(n.node.symbol, 22));
      const file = escapeAttr(shortBase(n.node.filePath));
      const cls = n.node.terminator ? ' terminated' : '';
      return `
        <g class="node${cls}" data-file="${escapeAttr(n.node.filePath)}" data-line="${n.node.line}">
          <rect x="${x}" y="${y}" rx="6" ry="6" width="${NODE_W}" height="${NODE_H}" />
          <text x="${n.x}" y="${y + 14}" text-anchor="middle">${label}</text>
          <text class="path" x="${n.x}" y="${y + 28}" text-anchor="middle">${file}:${n.node.line}</text>
        </g>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: var(--vscode-editor-background); color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: 12px; overflow: hidden; }
  header { padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 13px; margin: 0; font-weight: 600; }
  header label { color: var(--vscode-descriptionForeground); }
  header input[type="range"] { width: 100px; vertical-align: middle; }
  header button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; padding: 2px 8px; border-radius: 2px; cursor: pointer; font: inherit; }
  header button:hover { background: var(--vscode-button-hoverBackground); }
  #stage { width: 100%; height: calc(100% - 40px); overflow: hidden; cursor: grab; }
  #stage.panning { cursor: grabbing; }
  svg { display: block; }
  .edge { fill: none; stroke: var(--vscode-editorLineNumber-foreground); stroke-width: 1; opacity: 0.4; }
  .node rect { fill: var(--vscode-sideBar-background); stroke: var(--vscode-panel-border); stroke-width: 1; cursor: pointer; }
  .node:hover rect { stroke: var(--vscode-focusBorder); }
  .node text { fill: var(--vscode-foreground); pointer-events: none; }
  .node text.path { fill: var(--vscode-descriptionForeground); font-size: 10px; }
  .node.terminated rect { stroke-dasharray: 3 3; opacity: 0.6; }
  footer { padding: 4px 12px; border-top: 1px solid var(--vscode-panel-border); color: var(--vscode-descriptionForeground); font-size: 11px; }
</style>
</head>
<body>
<header>
  <h1>🌳 ${escapeAttr(rootName)}</h1>
  <label>depth <input id="depth" type="range" min="1" max="5" value="${depth}" /> <span id="depthVal">${depth}</span></label>
  <button id="fit">Fit</button>
  <button id="reset">100%</button>
  <span style="color: var(--vscode-descriptionForeground)">${flat.nodes.length} node${flat.nodes.length === 1 ? '' : 's'}</span>
</header>
<div id="stage">
  <svg id="svg" viewBox="${vbX} ${vbY} ${vbWidth} ${vbHeight}" preserveAspectRatio="xMidYMid meet">
    ${edges}
    ${nodes}
  </svg>
</div>
<footer>
  Click a node to open · drag to pan · ctrl/⌘+scroll to zoom · <kbd>f</kbd> fit · <kbd>0</kbd> reset
</footer>
<script>
  const vscode = acquireVsCodeApi();
  const stage = document.getElementById('stage');
  const svg = document.getElementById('svg');
  const baseBox = { x: ${vbX}, y: ${vbY}, w: ${vbWidth}, h: ${vbHeight} };
  let zoom = 1;
  let panX = 0;
  let panY = 0;

  function apply() {
    const w = baseBox.w / zoom;
    const h = baseBox.h / zoom;
    svg.setAttribute('viewBox', \`\${baseBox.x + panX} \${baseBox.y + panY} \${w} \${h}\`);
  }

  // Click a node to reveal its source.
  for (const node of document.querySelectorAll('.node')) {
    node.addEventListener('click', () => {
      vscode.postMessage({ type: 'reveal', payload: { filePath: node.dataset.file, line: Number(node.dataset.line) } });
    });
  }

  // Zoom (ctrl/meta + wheel).
  stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoom = Math.min(2.5, Math.max(0.3, zoom * delta));
    apply();
  }, { passive: false });

  // Pan (drag).
  let dragStart = null;
  stage.addEventListener('mousedown', (e) => {
    dragStart = { x: e.clientX, y: e.clientY, panX, panY };
    stage.classList.add('panning');
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragStart) return;
    const dx = (e.clientX - dragStart.x) * (baseBox.w / zoom / stage.clientWidth);
    const dy = (e.clientY - dragStart.y) * (baseBox.h / zoom / stage.clientHeight);
    panX = dragStart.panX - dx;
    panY = dragStart.panY - dy;
    apply();
  });
  window.addEventListener('mouseup', () => {
    dragStart = null;
    stage.classList.remove('panning');
  });

  // Keyboard.
  window.addEventListener('keydown', (e) => {
    if (e.key === '0') { zoom = 1; panX = 0; panY = 0; apply(); }
    if (e.key === 'f') { zoom = 1; panX = 0; panY = 0; apply(); }
  });

  // Depth slider re-asks the host.
  const depthInput = document.getElementById('depth');
  const depthVal = document.getElementById('depthVal');
  depthInput.addEventListener('input', () => {
    depthVal.textContent = depthInput.value;
  });
  depthInput.addEventListener('change', () => {
    vscode.postMessage({ type: 'changeDepth', payload: { depth: Number(depthInput.value) } });
  });
  document.getElementById('fit').addEventListener('click', () => { zoom = 1; panX = 0; panY = 0; apply(); });
  document.getElementById('reset').addEventListener('click', () => { zoom = 1; panX = 0; panY = 0; apply(); });
</script>
</body>
</html>`;
};

const truncate = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const shortBase = (p: string): string => p.split(/[\\/]/).slice(-1)[0] ?? p;
