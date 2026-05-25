import { describe, expect, it } from 'vitest';
import { diffBehavior } from '../src/behavior-diff/index.js';
import { extractDartFacts } from '../src/parsers/dart/facts.js';
import { buildDartFunctionTable } from '../src/parsers/dart/function-table.js';
import { extractGoFacts } from '../src/parsers/go/facts.js';
import { buildGoFunctionTable } from '../src/parsers/go/function-table.js';
import { diffFunctionTables } from '../src/parsers/typescript/diff-functions.js';

const GO = '/virtual/example.go';
const DART = '/virtual/example.dart';

function namesOf(t: ReturnType<typeof buildGoFunctionTable>): string[] {
  return [...t.functions.values()].map((f) => f.name).sort();
}

describe('Go — buildGoFunctionTable', () => {
  it('extracts top-level functions', () => {
    const t = buildGoFunctionTable(
      GO,
      `package main

func Add(a, b int) int {
    return a + b
}

func helper() {
    println("hi")
}
`,
    );
    expect(namesOf(t)).toEqual(['Add', 'helper']);
  });

  it('qualifies methods with receiver type', () => {
    const t = buildGoFunctionTable(
      GO,
      `func (u *User) Greet() string { return "hi " + u.Name }
func (u User) name() string { return u.Name }`,
    );
    expect(namesOf(t)).toEqual(['User.Greet', 'User.name']);
  });

  it('detects exported via capital-letter convention', () => {
    const t = buildGoFunctionTable(GO, 'func Public() {}\nfunc private() {}');
    const map = new Map([...t.functions.values()].map((f) => [f.name, f.isExported]));
    expect(map.get('Public')).toBe(true);
    expect(map.get('private')).toBe(false);
  });

  it('captures leading // doc comments', () => {
    const t = buildGoFunctionTable(
      GO,
      `// Add returns the sum of a and b.
// It is exported.
func Add(a, b int) int { return a + b }`,
    );
    const fn = [...t.functions.values()].find((f) => f.name === 'Add')!;
    expect(fn.leadingDocText).toContain('Add returns the sum');
  });
});

describe('Go — extractGoFacts', () => {
  it('detects goroutine launches as async-ish', () => {
    const facts = extractGoFacts(`func main() { go process() }`);
    expect(facts.isAsync).toBe(true);
  });

  it('detects panic + err-return throws', () => {
    const facts = extractGoFacts(
      `func op() (int, error) {
        if bad { panic("nope") }
        if other { return 0, err }
        return 1, nil
      }`,
    );
    expect(facts.throws.length).toBeGreaterThan(0);
  });

  it('detects network + console effects', () => {
    const facts = extractGoFacts(
      `func go() {
        http.Get("/x")
        fmt.Println("hi")
      }`,
    );
    expect(facts.effects.has('network')).toBe(true);
    expect(facts.effects.has('console')).toBe(true);
  });
});

describe('Go — diffBehavior end-to-end', () => {
  it('flags signature change', () => {
    const before = buildGoFunctionTable(GO, 'func F(a int) int { return a }');
    const after = buildGoFunctionTable(GO, 'func F(a, b int) int { return a + b }');
    const d = diffFunctionTables(before, after);
    expect(d.modified).toHaveLength(1);
    const r = diffBehavior(d.modified[0]!.before, d.modified[0]!.after);
    expect(r.diffs.some((x) => x.type === 'signature')).toBe(true);
  });
});

describe('Dart — buildDartFunctionTable', () => {
  it('extracts top-level functions', () => {
    const t = buildDartFunctionTable(
      DART,
      `int add(int a, int b) {
  return a + b;
}

void helper() {
  print('hi');
}
`,
    );
    expect(namesOf(t).sort()).toContain('add');
    expect(namesOf(t).sort()).toContain('helper');
  });

  it('qualifies class methods with class name', () => {
    const t = buildDartFunctionTable(
      DART,
      `class User {
  String name;
  User(this.name);
  String greet() { return 'hi ' + name; }
}`,
    );
    expect(namesOf(t)).toContain('User.greet');
  });

  it('detects underscore-prefixed names as private', () => {
    const t = buildDartFunctionTable(DART, 'void publicFn() {}\nvoid _privateFn() {}');
    const map = new Map([...t.functions.values()].map((f) => [f.name, f.isExported]));
    expect(map.get('publicFn')).toBe(true);
    expect(map.get('_privateFn')).toBe(false);
  });
});

describe('Dart — extractDartFacts', () => {
  it('detects async + Future return type', () => {
    const facts = extractDartFacts(
      `Future<User> fetchUser(String uid) async { return await db.get(uid); }`,
    );
    expect(facts.isAsync).toBe(true);
    expect(facts.returnType).toContain('Future<User>');
  });

  it('detects setState as a side-effect (Flutter rebuild)', () => {
    const facts = extractDartFacts(
      `void increment() {
        setState(() { counter++; });
      }`,
    );
    expect(facts.effects.has('mutation')).toBe(true);
  });

  it('detects network effects via http', () => {
    const facts = extractDartFacts(
      `Future<void> go() async { final r = await http.get(Uri.parse('https://x')); }`,
    );
    expect(facts.effects.has('network')).toBe(true);
  });
});

describe('Dart — diffBehavior end-to-end', () => {
  it('flags async-ness change on Dart functions', () => {
    const before = buildDartFunctionTable(DART, 'int f() { return 1; }');
    const after = buildDartFunctionTable(DART, 'Future<int> f() async { return 1; }');
    const d = diffFunctionTables(before, after);
    expect(d.modified.length + d.added.length).toBeGreaterThanOrEqual(1);
  });
});
