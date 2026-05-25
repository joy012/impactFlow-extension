import { describe, expect, it } from 'vitest';
import { extractElixirFacts } from '../src/parsers/elixir/facts.js';
import { buildElixirFunctionTable } from '../src/parsers/elixir/function-table.js';
import { extractLuaFacts } from '../src/parsers/lua/facts.js';
import { buildLuaFunctionTable } from '../src/parsers/lua/function-table.js';
import { extractSwiftFacts } from '../src/parsers/swift/facts.js';
import { buildSwiftFunctionTable } from '../src/parsers/swift/function-table.js';

const SWIFT = '/v/ex.swift';
const LUA = '/v/ex.lua';
const EX = '/v/ex.ex';

function names(t: { functions: Map<string, { name: string }> }): string[] {
  return [...t.functions.values()].map((f) => f.name).sort();
}

describe('Swift', () => {
  it('extracts class methods with async / throws', () => {
    const t = buildSwiftFunctionTable(
      SWIFT,
      `class Service {
        func fetchUser(_ id: Int) async throws -> User { return try await db.get(id) }
        private func log(_ m: String) { print(m) }
      }`,
    );
    expect(names(t)).toEqual(['Service.fetchUser', 'Service.log']);
  });

  it('detects async + throws + URLSession effect', () => {
    const facts = extractSwiftFacts(
      `func go() async throws {
        let r = try await URLSession.shared.data(from: u)
        print(r)
      }`,
    );
    expect(facts.isAsync).toBe(true);
    expect(facts.throws.length).toBeGreaterThan(0);
    expect(facts.effects.has('network')).toBe(true);
    expect(facts.effects.has('console')).toBe(true);
  });
});

describe('Lua', () => {
  it('extracts function + method declarations', () => {
    const t = buildLuaFunctionTable(
      LUA,
      `function add(a, b)
  return a + b
end

function User:greet()
  print('hi ' .. self.name)
end

local function helper()
  return 1
end`,
    );
    expect(names(t)).toEqual(['User:greet', 'add', 'helper']);
  });

  it('marks `local function` as not exported', () => {
    const t = buildLuaFunctionTable(LUA, 'function pub() end\nlocal function priv() end');
    const map = new Map([...t.functions.values()].map((f) => [f.name, f.isExported]));
    expect(map.get('pub')).toBe(true);
    expect(map.get('priv')).toBe(false);
  });

  it('detects io + os effects', () => {
    const facts = extractLuaFacts(`function go()
      local f = io.open('/x')
      print(os.getenv('KEY'))
    end`);
    expect(facts.effects.has('fs')).toBe(true);
    expect(facts.effects.has('console')).toBe(true);
    expect(facts.effects.has('env')).toBe(true);
  });
});

describe('Elixir', () => {
  it('extracts def + defp within defmodule', () => {
    const t = buildElixirFunctionTable(
      EX,
      `defmodule User do
  def greet(name) do
    "hi " <> name
  end

  defp secret() do
    :ok
  end
end`,
    );
    expect(names(t)).toContain('User.greet');
    expect(names(t)).toContain('User.secret');
  });

  it('marks defp as private', () => {
    const t = buildElixirFunctionTable(
      EX,
      `defmodule A do
  def pub() do :ok end
  defp priv() do :ok end
end`,
    );
    const map = new Map([...t.functions.values()].map((f) => [f.name, f.isExported]));
    expect(map.get('A.pub')).toBe(true);
    expect(map.get('A.priv')).toBe(false);
  });

  it('detects Logger + File + HTTPoison effects', () => {
    const facts = extractElixirFacts(`def go() do
      File.read("/x")
      HTTPoison.get("https://x")
      Logger.info("hi")
    end`);
    expect(facts.effects.has('fs')).toBe(true);
    expect(facts.effects.has('network')).toBe(true);
    expect(facts.effects.has('console')).toBe(true);
  });
});
