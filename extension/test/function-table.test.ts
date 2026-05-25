import { describe, expect, it } from 'vitest';
import { diffFunctionTables, emptyTable } from '../src/parsers/typescript/diff-functions.js';
import { buildFunctionTable } from '../src/parsers/typescript/function-table.js';

const F = '/virtual/example.ts';

function names(t: ReturnType<typeof buildFunctionTable>): string[] {
  return [...t.functions.values()].map((f) => f.name).sort();
}

describe('buildFunctionTable', () => {
  it('extracts top-level function declarations', () => {
    const t = buildFunctionTable(
      F,
      `
        export function add(a: number, b: number) { return a + b; }
        function helper() {}
      `,
    );
    expect(names(t)).toEqual(['add', 'helper']);
  });

  it('extracts class methods, constructors, and accessors', () => {
    const t = buildFunctionTable(
      F,
      `
        class User {
          constructor(public name: string) {}
          greet() { return 'hi ' + this.name; }
          static factory() { return new User('x'); }
          get upper() { return this.name.toUpperCase(); }
        }
      `,
    );
    expect(names(t)).toEqual(
      ['User.constructor', 'User.factory', 'User.get upper', 'User.greet'].sort(),
    );
  });

  it('extracts arrow functions assigned to variables', () => {
    const t = buildFunctionTable(
      F,
      `
        const add = (a: number, b: number) => a + b;
        export const square = (x: number) => x * x;
      `,
    );
    expect(names(t)).toEqual(['add', 'square']);
  });

  it('extracts default export arrow', () => {
    const t = buildFunctionTable(F, 'export default (x: number) => x + 1;');
    expect(names(t)).toContain('default');
  });

  it('returns stable IDs across whitespace-only changes', () => {
    const before = buildFunctionTable(F, 'function f() { return 1; }');
    const after = buildFunctionTable(F, '  function f() {\n  return 1;\n}\n');
    const a = before.functions.get(`${F}::f`);
    const b = after.functions.get(`${F}::f`);
    expect(a?.bodyHash).toBe(b?.bodyHash);
  });

  it('detects body change via hash difference', () => {
    const before = buildFunctionTable(F, 'function f() { return 1; }');
    const after = buildFunctionTable(F, 'function f() { return 2; }');
    expect(before.functions.get(`${F}::f`)?.bodyHash).not.toBe(
      after.functions.get(`${F}::f`)?.bodyHash,
    );
  });

  it('ignores comment-only changes via body hash', () => {
    const before = buildFunctionTable(F, 'function f() { /* note */ return 1; }');
    const after = buildFunctionTable(F, 'function f() { return 1; // tail\n }');
    expect(before.functions.get(`${F}::f`)?.bodyHash).toBe(
      after.functions.get(`${F}::f`)?.bodyHash,
    );
  });
});

describe('diffFunctionTables', () => {
  it('classifies added / removed / modified', () => {
    const before = buildFunctionTable(
      F,
      `
        function a() { return 1; }
        function b() { return 2; }
      `,
    );
    const after = buildFunctionTable(
      F,
      `
        function a() { return 1; }
        function b() { return 999; }
        function c() { return 3; }
      `,
    );
    const d = diffFunctionTables(before, after);
    expect(d.added.map((x) => x.name)).toEqual(['c']);
    expect(d.removed.map((x) => x.name)).toEqual([]);
    expect(d.modified.map((x) => x.after.name)).toEqual(['b']);
  });

  it('treats missing baseline as all-added', () => {
    const after = buildFunctionTable(F, 'function a() {} function b() {}');
    const d = diffFunctionTables(emptyTable(F), after);
    expect(d.added.map((x) => x.name).sort()).toEqual(['a', 'b']);
    expect(d.removed).toHaveLength(0);
    expect(d.modified).toHaveLength(0);
  });

  it('handles deletion: removed when present in baseline only', () => {
    const before = buildFunctionTable(F, 'function gone() {}');
    const after = buildFunctionTable(F, '');
    const d = diffFunctionTables(before, after);
    expect(d.removed.map((x) => x.name)).toEqual(['gone']);
  });
});
