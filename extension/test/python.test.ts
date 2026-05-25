import { describe, expect, it } from 'vitest';
import { diffBehavior } from '../src/behavior-diff/index.js';
import { extractPythonFacts } from '../src/parsers/python/facts.js';
import { buildPythonFunctionTable } from '../src/parsers/python/function-table.js';
import { diffFunctionTables } from '../src/parsers/typescript/diff-functions.js';

const F = '/virtual/example.py';

function names(t: ReturnType<typeof buildPythonFunctionTable>): string[] {
  return [...t.functions.values()].map((f) => f.name).sort();
}

describe('Python — buildPythonFunctionTable', () => {
  it('extracts top-level defs', () => {
    const t = buildPythonFunctionTable(
      F,
      `def add(a, b):
    return a + b

def helper():
    pass
`,
    );
    expect(names(t)).toEqual(['add', 'helper']);
  });

  it('extracts async def', () => {
    const t = buildPythonFunctionTable(
      F,
      `async def fetch_user(uid):
    return await db.get(uid)
`,
    );
    expect(names(t)).toEqual(['fetch_user']);
  });

  it('qualifies class methods with the class name', () => {
    const t = buildPythonFunctionTable(
      F,
      `class User:
    def __init__(self, name):
        self.name = name

    def greet(self):
        return "hi " + self.name

    @staticmethod
    def factory():
        return User("x")
`,
    );
    expect(names(t)).toEqual(['User.__init__', 'User.factory', 'User.greet']);
  });

  it('detects exported vs private convention', () => {
    const t = buildPythonFunctionTable(
      F,
      `def public(): pass
def _private(): pass
def __init__(): pass
`,
    );
    const map = new Map([...t.functions.values()].map((f) => [f.name, f.isExported]));
    expect(map.get('public')).toBe(true);
    expect(map.get('_private')).toBe(false);
    expect(map.get('__init__')).toBe(true);
  });

  it('captures decorators in leading doc', () => {
    const t = buildPythonFunctionTable(
      F,
      `@cache
@app.route("/x")
def handler():
    """Returns x."""
    return 1
`,
    );
    const entry = [...t.functions.values()].find((f) => f.name === 'handler')!;
    expect(entry.leadingDocText).toContain('@cache');
    expect(entry.leadingDocText).toContain('@app.route');
    expect(entry.leadingDocText).toContain('"""Returns x."""');
  });
});

describe('Python — extractPythonFacts', () => {
  it('captures async, params, return type', () => {
    const facts = extractPythonFacts(
      `async def fetch_user(uid: int, retries: int = 3) -> User:
    if retries < 0:
        raise ValueError("bad")
    return await db.get(uid)`,
    );
    expect(facts.isAsync).toBe(true);
    expect(facts.paramSig).toContain('uid:int');
    expect(facts.returnType).toBe('User');
    expect(facts.throws.length).toBeGreaterThan(0);
  });

  it('detects network + console + env effects', () => {
    const facts = extractPythonFacts(
      `def go():
    print("hi")
    r = requests.get("https://x")
    return os.environ["KEY"]`,
    );
    expect(facts.effects.has('console')).toBe(true);
    expect(facts.effects.has('network')).toBe(true);
    expect(facts.effects.has('env')).toBe(true);
  });
});

describe('Python — diffBehavior end-to-end', () => {
  it('flags async-ness change on Python functions', () => {
    const before = buildPythonFunctionTable(F, 'def f():\n    return 1\n');
    const after = buildPythonFunctionTable(F, 'async def f():\n    return 1\n');
    const d = diffFunctionTables(before, after);
    expect(d.modified).toHaveLength(1);
    const r = diffBehavior(d.modified[0]!.before, d.modified[0]!.after);
    expect(r.diffs.some((x) => x.type === 'asyncness' && x.severity === 'high')).toBe(true);
  });

  it('flags signature change on Python functions', () => {
    const before = buildPythonFunctionTable(F, 'def f(a):\n    return a\n');
    const after = buildPythonFunctionTable(F, 'def f(a, b):\n    return a + b\n');
    const d = diffFunctionTables(before, after);
    const r = diffBehavior(d.modified[0]!.before, d.modified[0]!.after);
    expect(r.diffs.some((x) => x.type === 'signature')).toBe(true);
  });

  it('flags side-effect introduction (network) on Python functions', () => {
    const before = buildPythonFunctionTable(F, 'def f():\n    return 1\n');
    const after = buildPythonFunctionTable(F, 'def f():\n    requests.get("/x")\n    return 1\n');
    const d = diffFunctionTables(before, after);
    const r = diffBehavior(d.modified[0]!.before, d.modified[0]!.after);
    expect(r.diffs.some((x) => x.type === 'side_effect_surface')).toBe(true);
  });
});
