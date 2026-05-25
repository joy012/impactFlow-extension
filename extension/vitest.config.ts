import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Integration tests run via @vscode/test-cli (which loads `vscode` from the
    // Extension Development Host). Vitest can't resolve the `vscode` module.
    exclude: ['test/integration/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
    passWithNoTests: true,
    setupFiles: ['./test/setup.ts'],
  },
});
