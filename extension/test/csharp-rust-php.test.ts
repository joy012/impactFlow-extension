import { describe, expect, it } from 'vitest';
import { extractCsharpFacts } from '../src/parsers/csharp/facts.js';
import { buildCsharpFunctionTable } from '../src/parsers/csharp/function-table.js';
import { extractPhpFacts } from '../src/parsers/php/facts.js';
import { buildPhpFunctionTable } from '../src/parsers/php/function-table.js';
import { extractRustFacts } from '../src/parsers/rust/facts.js';
import { buildRustFunctionTable } from '../src/parsers/rust/function-table.js';

const CS = '/v/Ex.cs';
const RS = '/v/ex.rs';
const PHP = '/v/ex.php';

function names(t: { functions: Map<string, { name: string }> }): string[] {
  return [...t.functions.values()].map((f) => f.name).sort();
}

describe('C# — buildCsharpFunctionTable', () => {
  it('extracts class methods and async', () => {
    const t = buildCsharpFunctionTable(
      CS,
      `public class Service {
        public async Task<string> Fetch(int id) { return await db.Get(id); }
        private void Log(string m) { Console.WriteLine(m); }
      }`,
    );
    expect(names(t)).toEqual(['Service.Fetch', 'Service.Log']);
  });
  it('marks public/internal as exported, private as not', () => {
    const t = buildCsharpFunctionTable(
      CS,
      `public class A {
        public int Pub() { return 1; }
        private int Priv() { return 2; }
      }`,
    );
    const map = new Map([...t.functions.values()].map((f) => [f.name, f.isExported]));
    expect(map.get('A.Pub')).toBe(true);
    expect(map.get('A.Priv')).toBe(false);
  });
});

describe('C# — extractCsharpFacts', () => {
  it('detects async via Task / async', () => {
    const facts = extractCsharpFacts('public async Task<int> Op() { return await Y(); }');
    expect(facts.isAsync).toBe(true);
  });
  it('detects HttpClient + Console effects', () => {
    const facts = extractCsharpFacts(
      `public void Go() {
        var c = new HttpClient();
        Console.WriteLine("hi");
      }`,
    );
    expect(facts.effects.has('network')).toBe(true);
    expect(facts.effects.has('console')).toBe(true);
  });
});

describe('Rust — buildRustFunctionTable', () => {
  it('extracts top-level fn + impl methods', () => {
    const t = buildRustFunctionTable(
      RS,
      `pub fn add(a: i32, b: i32) -> i32 { a + b }

impl User {
    pub fn greet(&self) -> String { format!("hi {}", self.name) }
    fn secret(&self) {}
}`,
    );
    expect(names(t)).toEqual(['User.greet', 'User.secret', 'add']);
  });
  it('marks pub as exported', () => {
    const t = buildRustFunctionTable(RS, 'pub fn p() {}\nfn pv() {}');
    const map = new Map([...t.functions.values()].map((f) => [f.name, f.isExported]));
    expect(map.get('p')).toBe(true);
    expect(map.get('pv')).toBe(false);
  });
});

describe('Rust — extractRustFacts', () => {
  it('detects async fn', () => {
    const facts = extractRustFacts('pub async fn fetch() -> Result<User, Error> { Ok(u) }');
    expect(facts.isAsync).toBe(true);
  });
  it('records panic + Result as throws-proxy', () => {
    const facts = extractRustFacts(
      `fn op() -> Result<i32, Error> {
        if bad { panic!("nope"); }
        Ok(1)
      }`,
    );
    expect(facts.throws.length).toBeGreaterThan(0);
  });
  it('detects println + reqwest', () => {
    const facts = extractRustFacts(
      `fn go() {
        println!("hi");
        let r = reqwest::get("https://x").unwrap();
      }`,
    );
    expect(facts.effects.has('console')).toBe(true);
    expect(facts.effects.has('network')).toBe(true);
  });
});

describe('PHP — buildPhpFunctionTable', () => {
  it('extracts top-level + class methods', () => {
    const t = buildPhpFunctionTable(
      PHP,
      `<?php
function add($a, $b) { return $a + $b; }

class User {
    public function greet() { return "hi"; }
    private function secret() {}
}`,
    );
    expect(names(t)).toEqual(['User.greet', 'User.secret', 'add']);
  });
  it('marks private as not exported', () => {
    const t = buildPhpFunctionTable(
      PHP,
      `class A {
        public function pub() {}
        private function priv() {}
      }`,
    );
    const map = new Map([...t.functions.values()].map((f) => [f.name, f.isExported]));
    expect(map.get('A.pub')).toBe(true);
    expect(map.get('A.priv')).toBe(false);
  });
});

describe('PHP — extractPhpFacts', () => {
  it('detects file + env effects', () => {
    const facts = extractPhpFacts(
      `function go() {
        $r = file_get_contents("/etc/x");
        echo $_ENV["KEY"];
      }`,
    );
    expect(facts.effects.has('fs')).toBe(true);
    expect(facts.effects.has('env')).toBe(true);
  });
  it('detects throw with class name', () => {
    const facts = extractPhpFacts(
      `function f($x) {
        if ($x < 0) throw new InvalidArgumentException("neg");
        return $x;
      }`,
    );
    expect(facts.throws).toContain('InvalidArgumentException');
  });
});
