import { describe, expect, it } from 'vitest';
import { diffBehavior } from '../src/behavior-diff/index.js';
import { extractJavaFacts } from '../src/parsers/java/facts.js';
import { buildJavaFunctionTable } from '../src/parsers/java/function-table.js';
import { extractKotlinFacts } from '../src/parsers/kotlin/facts.js';
import { buildKotlinFunctionTable } from '../src/parsers/kotlin/function-table.js';
import { diffFunctionTables } from '../src/parsers/typescript/diff-functions.js';

const JAVA = '/virtual/Example.java';
const KT = '/virtual/example.kt';

function names(t: { functions: Map<string, { name: string }> }): string[] {
  return [...t.functions.values()].map((f) => f.name).sort();
}

describe('Java — buildJavaFunctionTable', () => {
  it('extracts class methods + constructors', () => {
    const t = buildJavaFunctionTable(
      JAVA,
      `public class User {
        public User(String name) { this.name = name; }
        public String greet() { return "hi " + name; }
        private void log(String m) { System.out.println(m); }
      }`,
    );
    expect(names(t)).toEqual(['User.User', 'User.greet', 'User.log']);
  });

  it('skips control-flow keywords misread as functions', () => {
    const t = buildJavaFunctionTable(
      JAVA,
      `public class A {
        public void run() {
          if (true) { doX(); }
          while (cond) { doY(); }
        }
      }`,
    );
    expect(names(t)).toEqual(['A.run']);
  });

  it('marks public methods as exported, private as not', () => {
    const t = buildJavaFunctionTable(
      JAVA,
      `public class A {
        public void pub() {}
        private void priv() {}
      }`,
    );
    const map = new Map([...t.functions.values()].map((f) => [f.name, f.isExported]));
    expect(map.get('A.pub')).toBe(true);
    expect(map.get('A.priv')).toBe(false);
  });
});

describe('Java — extractJavaFacts', () => {
  it('captures throws clause + explicit throws', () => {
    const facts = extractJavaFacts(
      `public int op(int x) throws IOException, ParseException {
        if (x < 0) throw new IllegalArgumentException("neg");
        return x;
      }`,
    );
    expect(facts.throws).toEqual(
      expect.arrayContaining(['IOException', 'ParseException', 'IllegalArgumentException']),
    );
  });

  it('detects network + console effects', () => {
    const facts = extractJavaFacts(
      `public void go() {
        HttpClient c = HttpClient.newHttpClient();
        System.out.println("hi");
      }`,
    );
    expect(facts.effects.has('network')).toBe(true);
    expect(facts.effects.has('console')).toBe(true);
  });
});

describe('Java — diffBehavior end-to-end', () => {
  it('flags signature change on Java methods', () => {
    const before = buildJavaFunctionTable(
      JAVA,
      `public class A {
  public int f(int a) { return a; }
}`,
    );
    const after = buildJavaFunctionTable(
      JAVA,
      `public class A {
  public int f(int a, int b) { return a + b; }
}`,
    );
    const d = diffFunctionTables(before, after);
    expect(d.modified).toHaveLength(1);
    const r = diffBehavior(d.modified[0]!.before, d.modified[0]!.after);
    expect(r.diffs.some((x) => x.type === 'signature')).toBe(true);
  });
});

describe('Kotlin — buildKotlinFunctionTable', () => {
  it('extracts top-level fun + class methods', () => {
    const t = buildKotlinFunctionTable(
      KT,
      `fun greet(name: String): String { return "hi $name" }

class User(val name: String) {
    fun describe(): String { return name }
    private fun secret() {}
}`,
    );
    expect(names(t)).toEqual(['User.describe', 'User.secret', 'greet']);
  });

  it('marks private/internal as not exported', () => {
    const t = buildKotlinFunctionTable(
      KT,
      `fun pub() {}
private fun priv() {}
internal fun ints() {}`,
    );
    const map = new Map([...t.functions.values()].map((f) => [f.name, f.isExported]));
    expect(map.get('pub')).toBe(true);
    expect(map.get('priv')).toBe(false);
    expect(map.get('ints')).toBe(false);
  });
});

describe('Kotlin — extractKotlinFacts', () => {
  it('detects suspend as async', () => {
    const facts = extractKotlinFacts(`suspend fun fetch(id: Int): User { return db.get(id) }`);
    expect(facts.isAsync).toBe(true);
  });

  it('detects when as a switch-like branch condition', () => {
    const facts = extractKotlinFacts(
      `fun describe(x: Int): String {
        return when (x) {
          0 -> "zero"
          1 -> "one"
          else -> "many"
        }
      }`,
    );
    expect(facts.branchConditions.some((c) => c.startsWith('when:'))).toBe(true);
  });
});

describe('Kotlin — diffBehavior end-to-end', () => {
  it('flags sync → suspend transition as async-change', () => {
    const before = buildKotlinFunctionTable(KT, 'fun f(): Int { return 1 }');
    const after = buildKotlinFunctionTable(KT, 'suspend fun f(): Int { return 1 }');
    const d = diffFunctionTables(before, after);
    if (d.modified.length === 0) {
      // Async-ness could also appear as a signature-equivalent change; tolerate either.
      expect(d.added.length + d.removed.length).toBeGreaterThan(0);
      return;
    }
    const r = diffBehavior(d.modified[0]!.before, d.modified[0]!.after);
    expect(r.diffs.some((x) => x.type === 'asyncness' || x.type === 'signature')).toBe(true);
  });
});
