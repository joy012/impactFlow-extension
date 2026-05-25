import { describe, expect, it } from 'vitest';
import { renderTreeMarkdown } from '../src/impact/tree-render.js';

describe('renderTreeMarkdown', () => {
  it('renders an empty tree with "no callers"', () => {
    const md = renderTreeMarkdown({
      filePath: '/proj/src/api.ts',
      symbol: 'getUser',
      line: 12,
      children: [],
    });
    expect(md).toContain('Caller Tree');
    expect(md).toContain('`getUser`');
    expect(md).toContain('api.ts:12');
    expect(md).toContain('No callers found');
  });

  it('renders nested callers as indented markdown', () => {
    const md = renderTreeMarkdown(
      {
        filePath: '/proj/src/api.ts',
        symbol: 'getUser',
        line: 10,
        children: [
          {
            filePath: '/proj/src/handler.ts',
            symbol: 'userHandler',
            line: 5,
            children: [{ filePath: '/proj/src/server.ts', symbol: 'main', line: 1, children: [] }],
          },
          { filePath: '/proj/test/api.test.ts', symbol: 'testFetch', line: 3, children: [] },
        ],
      },
      '/proj',
    );
    expect(md).toContain('userHandler');
    expect(md).toContain('main');
    expect(md).toContain('testFetch');
    expect(md).toContain('src/handler.ts:5');
    expect(md).toContain('3 callers across the tree.');
  });

  it('shows terminator labels for capped subtrees', () => {
    const md = renderTreeMarkdown({
      filePath: '/proj/a.ts',
      symbol: 'root',
      line: 1,
      children: [
        {
          filePath: '/proj/b.ts',
          symbol: 'caller',
          line: 2,
          children: [],
          terminator: 'depth-cap',
        },
      ],
    });
    expect(md).toContain('depth-cap');
  });
});
