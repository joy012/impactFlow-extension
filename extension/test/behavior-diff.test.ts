import { describe, expect, it } from 'vitest';
import { diffBehavior } from '../src/behavior-diff/index.js';
import type { FnEntry } from '../src/parsers/typescript/function-table.js';

function fn(name: string, fullText: string, kind: FnEntry['kind'] = 'function'): FnEntry {
  return {
    id: `/v::${name}`,
    name,
    kind,
    startLine: 1,
    endLine: 1,
    bodyHash: 'x',
    fullText,
    filePath: '/v',
  };
}

describe('signature detector', () => {
  it('flags param count change as high severity', () => {
    const r = diffBehavior(
      fn('f', 'function f(a: number) { return a; }'),
      fn('f', 'function f(a: number, b: number) { return a + b; }'),
    );
    const sig = r.diffs.find((d) => d.type === 'signature');
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe('high');
  });

  it('does not flag identical signatures', () => {
    const r = diffBehavior(
      fn('f', 'function f(a: number) { return a; }'),
      fn('f', 'function f(a: number) { return a; }'),
    );
    expect(r.diffs.filter((d) => d.type === 'signature')).toEqual([]);
  });
});

describe('asyncness detector', () => {
  it('flags sync → async', () => {
    const r = diffBehavior(
      fn('f', 'function f() { return 1; }'),
      fn('f', 'async function f() { return 1; }'),
    );
    expect(r.diffs.some((d) => d.type === 'asyncness' && d.severity === 'high')).toBe(true);
  });
});

describe('return shape detector', () => {
  it('flags changed return value', () => {
    const r = diffBehavior(
      fn('f', 'function f() { return 1; }'),
      fn('f', 'function f() { return 2; }'),
    );
    expect(r.diffs.some((d) => d.type === 'return_shape')).toBe(true);
  });

  it('flags addition of a second return statement as high', () => {
    const r = diffBehavior(
      fn('f', 'function f(x: number) { return x; }'),
      fn('f', 'function f(x: number) { if (x < 0) return 0; return x; }'),
    );
    const rs = r.diffs.find((d) => d.type === 'return_shape')!;
    expect(rs.severity).toBe('high');
  });
});

describe('branch logic detector', () => {
  it('flags new if condition', () => {
    const r = diffBehavior(
      fn('f', 'function f(x: number) { return x; }'),
      fn('f', 'function f(x: number) { if (x > 10) return -1; return x; }'),
    );
    expect(r.diffs.some((d) => d.type === 'branch_logic')).toBe(true);
  });
});

describe('call set detector', () => {
  it('flags newly introduced fetch call', () => {
    const r = diffBehavior(
      fn('f', 'function f() { return 1; }'),
      fn('f', 'function f() { fetch("/api"); return 1; }'),
    );
    expect(r.diffs.some((d) => d.type === 'call_set')).toBe(true);
  });
});

describe('throw set detector', () => {
  it('flags new throw', () => {
    const r = diffBehavior(
      fn('f', 'function f(x: number) { return x; }'),
      fn('f', 'function f(x: number) { if (x < 0) throw new Error("neg"); return x; }'),
    );
    expect(r.diffs.some((d) => d.type === 'throw_set')).toBe(true);
  });
});

describe('side effect detector', () => {
  it('flags newly introduced fs call', () => {
    const r = diffBehavior(
      fn('f', 'function f() { return 1; }'),
      fn('f', 'function f() { fs.readFileSync("/x"); return 1; }'),
    );
    expect(r.diffs.some((d) => d.type === 'side_effect_surface')).toBe(true);
  });

  it('flags adding console.log', () => {
    const r = diffBehavior(
      fn('f', 'function f() { return 1; }'),
      fn('f', 'function f() { console.log("hi"); return 1; }'),
    );
    expect(r.diffs.some((d) => d.type === 'side_effect_surface')).toBe(true);
  });
});

describe('pure rename / formatting filter', () => {
  it('classifies whitespace-only changes as pure formatting', () => {
    const r = diffBehavior(
      fn('f', 'function f(){return 1;}'),
      fn('f', 'function f() {\n  return 1;\n}'),
    );
    expect(r.diffs).toEqual([]);
    expect(r.pureRenameOrFormatting).toBe(true);
  });

  it('classifies identifier-rename-only changes as pure rename', () => {
    const r = diffBehavior(
      fn('f', 'function f(a: number) { const x = a + 1; return x; }'),
      fn('f', 'function f(a: number) { const renamed = a + 1; return renamed; }'),
    );
    expect(r.diffs).toEqual([]);
    expect(r.pureRenameOrFormatting).toBe(true);
  });
});

describe('multi-class detection', () => {
  it('emits multiple diffs when several aspects change', () => {
    const r = diffBehavior(
      fn('f', 'function f(x: number) { return x; }'),
      fn(
        'f',
        'async function f(x: number, y: number) { if (x < 0) throw new Error(); return x + y; }',
      ),
    );
    const types = r.diffs.map((d) => d.type).sort();
    expect(types).toContain('signature');
    expect(types).toContain('asyncness');
    expect(types).toContain('throw_set');
  });
});
