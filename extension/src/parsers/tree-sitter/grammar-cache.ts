import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Language } from 'web-tree-sitter';
import { ensureParserReady, getGrammarRoot } from './init.js';

export type GrammarName = 'python' | 'typescript' | 'tsx' | 'javascript';

const MAX_RESIDENT = 6;

const FILENAME: Record<GrammarName, string> = {
  python: 'tree-sitter-python.wasm',
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm',
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

export const prepareGrammars = async (names: GrammarName[]): Promise<void> => {
  await ensureParserReady();
  await Promise.all(names.map(loadGrammar));
};

export const clearGrammarCache = (): void => {
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

const insert = (name: GrammarName, lang: Language): void => {
  if (cache.size >= MAX_RESIDENT) {
    const oldest = cache.keys().next().value as GrammarName | undefined;
    if (oldest) cache.delete(oldest);
  }
  cache.set(name, lang);
};

const touch = (name: GrammarName): void => {
  const lang = cache.get(name);
  if (!lang) return;
  cache.delete(name);
  cache.set(name, lang);
};
