import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Parser } from 'web-tree-sitter';

let grammarRoot: string | null = null;
let initPromise: Promise<void> | null = null;

export const setGrammarRoot = (absolutePath: string) => {
  grammarRoot = absolutePath;
};

export const getGrammarRoot = (): string => {
  if (!grammarRoot) {
    throw new Error(
      'tree-sitter grammar root not set. Call setGrammarRoot() before any parse call.',
    );
  }
  return grammarRoot;
};

export const ensureParserReady = async (): Promise<void> => {
  if (initPromise) return initPromise;
  const root = getGrammarRoot();
  const corePath = join(root, 'tree-sitter.wasm');
  if (!existsSync(corePath)) {
    throw new Error(
      `tree-sitter.wasm not found at ${corePath}. Run \`pnpm --filter extension build\` first.`,
    );
  }
  initPromise = Parser.init({
    locateFile: (file: string) => {
      // Emscripten asks for the original in-package name; we copy it under a shorter name.
      if (file === 'web-tree-sitter.wasm') return corePath;
      return join(root, file);
    },
  });
  return initPromise;
};

export const newParser = (): Parser => new Parser();
