// Pure renderer for caller trees — kept vscode-free so it can be unit-tested.
// The async builder (`buildCallerTree`) lives in `tree.ts` and depends on `vscode.executeReferenceProvider`.

export interface CallerNode {
  filePath: string;
  symbol: string;
  line: number;
  children: CallerNode[];
  terminator?: string;
}

export const renderTreeMarkdown = (root: CallerNode, workspaceRoot?: string): string => {
  const shorten = (p: string) =>
    workspaceRoot && p.startsWith(workspaceRoot) ? p.slice(workspaceRoot.length + 1) : p;

  const lines: string[] = [
    '# ImpactFlow — Caller Tree',
    '',
    `Root: **\`${root.symbol}\`** in \`${shorten(root.filePath)}:${root.line}\``,
    '',
    '> Depth-limited caller graph. Each child is a function that calls the parent.',
    '> Full interactive tree view (zoom · mini-map · subtree analysis) is the v0.2 webview (see `ROADMAP.md §4`).',
    '',
  ];

  let totalNodes = 0;
  const walk = (n: CallerNode, depth: number) => {
    totalNodes += 1;
    if (depth === 0) {
      lines.push('## Callers');
      lines.push('');
    } else {
      const indent = '  '.repeat(depth - 1);
      lines.push(`${indent}- \`${n.symbol}\` — \`${shorten(n.filePath)}:${n.line}\``);
    }
    for (const c of n.children) walk(c, depth + 1);
    if (n.terminator && depth > 0) {
      const indent = '  '.repeat(depth);
      lines.push(`${indent}_(${n.terminator})_`);
    }
  };
  walk(root, 0);

  if (root.children.length === 0) {
    lines.push('_No callers found in workspace._');
  } else {
    lines.push('');
    lines.push(`_${totalNodes - 1} caller${totalNodes === 2 ? '' : 's'} across the tree._`);
  }

  return lines.join('\n');
};
