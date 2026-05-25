// Bench-only entry point. Re-exports the parts of the engine that are pure
// (no `vscode` imports) so the bench harness can bundle them via esbuild.
export { diffBehavior } from '../src/behavior-diff/index.js';
export { buildFunctionTable, languageFor } from '../src/parsers/router.js';
export { prepareGrammars } from '../src/parsers/tree-sitter/grammar-cache.js';
export { setGrammarRoot } from '../src/parsers/tree-sitter/init.js';
export type { FnEntry, FunctionTable } from '../src/parsers/typescript/function-table.js';
export type { BehaviorDiff, BehaviorDiffType } from '../src/behavior-diff/index.js';
