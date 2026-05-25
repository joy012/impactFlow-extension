import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'dist/test/integration/**/*.test.js',
  mocha: { ui: 'tdd', timeout: 20_000 },
  workspaceFolder: './test/fixtures/empty-workspace',
});
