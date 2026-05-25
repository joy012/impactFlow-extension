import { describe, expect, it } from 'vitest';
import { buildAiPrompt } from '../src/ai-prompt.js';
import { extractFacts } from '../src/behavior-diff/facts.js';
import { diffBehavior } from '../src/behavior-diff/index.js';
import type { FnEntry } from '../src/parsers/typescript/function-table.js';
import type { FnSummary } from '../src/shared/messages.js';

function fn(name: string, fullText: string, doc = ''): FnEntry {
  return {
    id: `/v::${name}`,
    name,
    kind: 'function',
    startLine: 1,
    endLine: 1,
    bodyHash: 'x',
    fullText,
    filePath: '/v',
    isExported: true,
    leadingDocText: doc,
    leadingDocHash: doc ? `d${doc.length}` : '',
  };
}

describe('F1 stale-doc detector', () => {
  it('flags when body changes but doc-comment does not', () => {
    const before = fn('f', 'function f(x: number) { return x; }', '/** Doubles the input. */');
    const after = {
      ...fn('f', 'function f(x: number) { return x * 2; }', '/** Doubles the input. */'),
      bodyHash: 'y',
    };
    before.bodyHash = 'a';
    after.bodyHash = 'b';
    const r = diffBehavior(before, after);
    expect(r.diffs.some((d) => d.type === 'stale_doc')).toBe(true);
  });

  it('does not flag when doc-comment is empty', () => {
    const before = fn('f', 'function f() { return 1; }', '');
    const after = { ...fn('f', 'function f() { return 2; }', ''), bodyHash: 'b' };
    before.bodyHash = 'a';
    const r = diffBehavior(before, after);
    expect(r.diffs.some((d) => d.type === 'stale_doc')).toBe(false);
  });

  it('does not flag if doc-comment also changed', () => {
    const before = fn('f', 'function f() { return 1; }', '/** v1 */');
    const after = {
      ...fn('f', 'function f() { return 2; }', '/** v2 */'),
      bodyHash: 'b',
      leadingDocHash: 'd2',
    };
    before.bodyHash = 'a';
    before.leadingDocHash = 'd1';
    const r = diffBehavior(before, after);
    expect(r.diffs.some((d) => d.type === 'stale_doc')).toBe(false);
  });
});

describe('F12 complexity jump detector', () => {
  it('flags +3 complexity rise as medium severity', () => {
    const before = fn('f', 'function f(x: number) { return x; }');
    const after = fn(
      'f',
      `function f(x: number) {
        if (x < 0) return -1;
        if (x > 100) return 100;
        if (x === 0) return 0;
        for (let i = 0; i < x; i++) {
          if (i % 2) continue;
        }
        return x;
      }`,
    );
    const r = diffBehavior(before, after);
    expect(r.diffs.some((d) => d.type === 'complexity_jump' && d.severity === 'medium')).toBe(true);
  });

  it('does not flag a +1 rise', () => {
    const before = fn('f', 'function f(x: number) { return x; }');
    const after = fn('f', 'function f(x: number) { if (x < 0) return -1; return x; }');
    const r = diffBehavior(before, after);
    expect(r.diffs.some((d) => d.type === 'complexity_jump')).toBe(false);
  });
});

describe('FnFacts.complexity', () => {
  it('counts branches and logical operators', () => {
    const facts = extractFacts(
      `function f(x: number, y: number) {
        if (x > 0 && y > 0) return 1;
        if (x < 0 || y < 0) return -1;
        return 0;
      }`,
      'function',
    );
    // 1 base + 2 ifs + 1 && + 1 || = 5
    expect(facts.complexity).toBeGreaterThanOrEqual(4);
  });
});

describe('F11 AI prompt template', () => {
  it('renders sections only when data is present', () => {
    const minimal: FnSummary = {
      id: '/v::f',
      name: 'f',
      kind: 'function',
      line: 10,
      diffs: [{ type: 'signature', severity: 'high', description: 'param added', confidence: 0.9 }],
    };
    const prompt = buildAiPrompt(minimal, '/repo/src/foo.ts');
    expect(prompt).toContain('I changed `f`');
    expect(prompt).toContain('signature');
    expect(prompt).not.toContain('Tests that exercise');
  });

  it('includes test list when impactedTests present', () => {
    const withTests: FnSummary = {
      id: '/v::f',
      name: 'f',
      kind: 'function',
      line: 10,
      diffs: [],
      impactedTests: [{ filePath: '/repo/src/foo.test.ts', line: 5, sameFile: false }],
    };
    const prompt = buildAiPrompt(withTests, '/repo/src/foo.ts');
    expect(prompt).toContain('Tests that exercise this function');
    expect(prompt).toContain('foo.test.ts:5');
  });
});
