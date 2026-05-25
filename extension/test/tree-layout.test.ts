import { describe, expect, it } from 'vitest';
import { flatten, layoutTree } from '../src/impact/tree-layout.js';
import type { CallerNode } from '../src/impact/tree-render.js';

const mk = (symbol: string, children: CallerNode[] = []): CallerNode => ({
  filePath: `/p/${symbol}.ts`,
  symbol,
  line: 1,
  children,
});

describe('layoutTree', () => {
  it('places a single leaf at horizontal centre of its leaf-width', () => {
    const laid = layoutTree(mk('root'), { leafWidth: 200, levelHeight: 80 });
    expect(laid.x).toBe(100);
    expect(laid.y).toBe(0);
  });

  it('centres a parent above its children', () => {
    const root = mk('root', [mk('a'), mk('b')]);
    const laid = layoutTree(root, { leafWidth: 100, levelHeight: 80, siblingGap: 0 });
    const [a, b] = laid.children;
    // Children: left leaf at 50, right at 150; parent at midpoint = 100.
    expect(a!.x).toBe(50);
    expect(b!.x).toBe(150);
    expect(laid.x).toBe(100);
  });

  it('depth maps to y via levelHeight', () => {
    const root = mk('r', [mk('c1'), mk('c2', [mk('g1')])]);
    const laid = layoutTree(root, { levelHeight: 50 });
    expect(laid.y).toBe(0);
    expect(laid.children[0]!.y).toBe(50);
    expect(laid.children[1]!.children[0]!.y).toBe(100);
  });
});

describe('flatten', () => {
  it('emits one node + edges per parent→child link', () => {
    const root = mk('root', [mk('a'), mk('b', [mk('c')])]);
    const laid = layoutTree(root);
    const flat = flatten(laid);
    expect(flat.nodes.length).toBe(4);
    expect(flat.edges.length).toBe(3); // root→a, root→b, b→c
  });

  it('computes a non-degenerate bounding box', () => {
    const laid = layoutTree(mk('root', [mk('a'), mk('b'), mk('c')]));
    const flat = flatten(laid);
    expect(flat.bounds.maxX).toBeGreaterThan(flat.bounds.minX);
    expect(flat.bounds.maxY).toBeGreaterThan(flat.bounds.minY);
  });
});
