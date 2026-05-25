// Tidy-tree layout — vscode-free so it's unit-testable.
// Bottom-up: compute each subtree's width from leaf widths, then place children evenly.

import type { CallerNode } from './tree-render.js';

export interface LaidOutNode {
  node: CallerNode;
  /** Centre-x of this node in layout units. */
  x: number;
  /** Top-y of this node in layout units (depth-based). */
  y: number;
  children: LaidOutNode[];
}

export interface LayoutOptions {
  /** Horizontal pixels per leaf. */
  leafWidth?: number;
  /** Vertical pixels per depth level. */
  levelHeight?: number;
  /** Horizontal padding between sibling subtrees. */
  siblingGap?: number;
}

const DEFAULT_LEAF_WIDTH = 180;
const DEFAULT_LEVEL_HEIGHT = 80;
const DEFAULT_SIBLING_GAP = 20;

export const layoutTree = (root: CallerNode, opts: LayoutOptions = {}): LaidOutNode => {
  const leafWidth = opts.leafWidth ?? DEFAULT_LEAF_WIDTH;
  const levelHeight = opts.levelHeight ?? DEFAULT_LEVEL_HEIGHT;
  const siblingGap = opts.siblingGap ?? DEFAULT_SIBLING_GAP;

  const compute = (
    n: CallerNode,
    depth: number,
    leftOffset: number,
  ): { laid: LaidOutNode; width: number } => {
    if (n.children.length === 0) {
      return {
        laid: { node: n, x: leftOffset + leafWidth / 2, y: depth * levelHeight, children: [] },
        width: leafWidth,
      };
    }
    let cursor = leftOffset;
    const childResults = n.children.map((c, i) => {
      if (i > 0) cursor += siblingGap;
      const r = compute(c, depth + 1, cursor);
      cursor += r.width;
      return r;
    });
    const first = childResults[0]!.laid.x;
    const last = childResults[childResults.length - 1]!.laid.x;
    const myX = (first + last) / 2;
    return {
      laid: {
        node: n,
        x: myX,
        y: depth * levelHeight,
        children: childResults.map((r) => r.laid),
      },
      width: cursor - leftOffset,
    };
  };

  return compute(root, 0, 0).laid;
};

// Flatten for SVG-element generation; preserves parent→child edges via separate list.
export interface FlatTree {
  nodes: LaidOutNode[];
  edges: Array<{ from: LaidOutNode; to: LaidOutNode }>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export const flatten = (root: LaidOutNode, nodeWidth = 140, nodeHeight = 36): FlatTree => {
  const nodes: LaidOutNode[] = [];
  const edges: FlatTree['edges'] = [];
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const walk = (n: LaidOutNode) => {
    nodes.push(n);
    if (n.x - nodeWidth / 2 < minX) minX = n.x - nodeWidth / 2;
    if (n.x + nodeWidth / 2 > maxX) maxX = n.x + nodeWidth / 2;
    if (n.y < minY) minY = n.y;
    if (n.y + nodeHeight > maxY) maxY = n.y + nodeHeight;
    for (const c of n.children) {
      edges.push({ from: n, to: c });
      walk(c);
    }
  };
  walk(root);
  return { nodes, edges, bounds: { minX, maxX, minY, maxY } };
};
