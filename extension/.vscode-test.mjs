import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'dist/test/**/*.test.js',
  mocha: { ui: 'bdd', timeout: 20000 },
  workspaceFolder: './test/fixtures/empty-workspace',
});
