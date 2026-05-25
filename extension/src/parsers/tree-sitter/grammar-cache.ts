import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Language } from 'web-tree-sitter';
import { ensureParserReady, getGrammarRoot } from './init.js';

export type GrammarName =
  | 'python'
  | 'typescript'
  | 'tsx'
  | 'javascript'
  | 'go'
  | 'java'
  | 'kotlin'
  | 'rust'
  | 'csharp'
  | 'php'
  | 'scala'
  | 'objc'
  | 'lua'
  | 'elixir';

// We preload all supported grammars at activation/test setup (~14). MAX_RESIDENT
// is the cap for any single eviction pass; we set it above the preload count so
// LRU eviction stays a no-op in normal sessions.
const MAX_RESIDENT = 16;

const FILENAME: Record<GrammarName, string> = {
  python: 'tree-sitter-python.wasm',
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  go: 'tree-sitter-go.wasm',
  java: 'tree-sitter-java.wasm',
  kotlin: 'tree-sitter-kotlin.wasm',
  rust: 'tree-sitter-rust.wasm',
  csharp: 'tree-sitter-csharp.wasm',
  php: 'tree-sitter-php.wasm',
  scala: 'tree-sitter-scala.wasm',
  objc: 'tree-sitter-objc.wasm',
  lua: 'tree-sitter-lua.wasm',
  elixir: 'tree-sitter-elixir.wasm',
};

const cache = new Map<GrammarName, Language>();
const loadingPromises = new Map<GrammarName, Promise<Language>>();

export const loadGrammar = async (name: GrammarName): Promise<Language> => {
  await ensureParserReady();
  const cached = cache.get(name);
  if (cached) {
    touch(name);
    return cached;
  }
  const inflight = loadingPromises.get(name);
  if (inflight) return inflight;

  const promise = (async () => {
    const path = grammarPath(name);
    const lang = await Language.load(path);
    insert(name, lang);
    loadingPromises.delete(name);
    return lang;
  })();
  loadingPromises.set(name, promise);
  return promise;
};

export const getLoadedGrammar = (name: GrammarName): Language => {
  const lang = cache.get(name);
  if (!lang) {
    throw new Error(
      `Grammar "${name}" not loaded. Call prepareGrammars(['${name}']) during activation or test setup.`,
    );
  }
  touch(name);
  return lang;
};

export const isGrammarLoaded = (name: GrammarName): boolean => cache.has(name);

export const prepareGrammars = async (names: GrammarName[]): Promise<void> => {
  await ensureParserReady();
  await Promise.all(names.map(loadGrammar));
};

export const clearGrammarCache = () => {
  cache.clear();
  loadingPromises.clear();
};

const grammarPath = (name: GrammarName): string => {
  const path = join(getGrammarRoot(), FILENAME[name]);
  if (!existsSync(path)) {
    throw new Error(`Grammar file missing: ${path}. Did the build step copy WASMs?`);
  }
  return path;
};

const insert = (name: GrammarName, lang: Language) => {
  if (cache.size >= MAX_RESIDENT) {
    const oldest = cache.keys().next().value as GrammarName | undefined;
    if (oldest) cache.delete(oldest);
  }
  cache.set(name, lang);
};

const touch = (name: GrammarName) => {
  const lang = cache.get(name);
  if (!lang) return;
  cache.delete(name);
  cache.set(name, lang);
};
