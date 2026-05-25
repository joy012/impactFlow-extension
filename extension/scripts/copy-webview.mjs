import { cp, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, '../../webview/dist');
const dst = resolve(__dirname, '../dist/webview');

try {
  await stat(src);
} catch {
  console.error(
    `[copy-webview] webview build not found at ${src}. Run 'pnpm --filter webview build' first.`,
  );
  process.exit(1);
}

await rm(dst, { recursive: true, force: true });
await cp(src, dst, { recursive: true });
console.log(`[copy-webview] copied ${src} → ${dst}`);
