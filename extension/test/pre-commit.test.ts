import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installPreCommitHook, uninstallPreCommitHook } from '../src/git-hooks/pre-commit.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'impactflow-precommit-'));
  await fs.mkdir(join(root, '.git', 'hooks'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const readHook = () => fs.readFile(join(root, '.git', 'hooks', 'pre-commit'), 'utf8');

describe('pre-commit hook installer', () => {
  it('refuses without .git/', async () => {
    await fs.rm(join(root, '.git'), { recursive: true });
    const result = await installPreCommitHook(root, 'warn');
    expect(result.installed).toBe(false);
    expect(result.message).toContain('.git/');
  });

  it('installs a fresh hook in warn mode', async () => {
    const result = await installPreCommitHook(root, 'warn');
    expect(result.installed).toBe(true);
    const content = await readHook();
    expect(content).toContain('#!/usr/bin/env bash');
    expect(content).toContain('impactflow pre-commit (managed)');
    expect(content).toContain('# Mode: warn');
    expect(content).toContain('warn-only mode');
    expect(content).not.toContain('return 1');
  });

  it('installs in block mode', async () => {
    const result = await installPreCommitHook(root, 'block');
    expect(result.installed).toBe(true);
    const content = await readHook();
    expect(content).toContain('# Mode: block');
    expect(content).toContain('return 1');
  });

  it('preserves existing user hook content', async () => {
    const userHook = '#!/usr/bin/env bash\nset -eu\n\n# user pre-commit\necho "user hook"\n';
    await fs.writeFile(join(root, '.git', 'hooks', 'pre-commit'), userHook, { mode: 0o755 });
    const result = await installPreCommitHook(root, 'warn');
    expect(result.installed).toBe(true);
    const content = await readHook();
    expect(content).toContain('# user pre-commit');
    expect(content).toContain('echo "user hook"');
    expect(content).toContain('impactflow pre-commit (managed)');
  });

  it('idempotent install — running twice does not duplicate the managed block', async () => {
    await installPreCommitHook(root, 'warn');
    await installPreCommitHook(root, 'warn');
    const content = await readHook();
    const matches = content.match(/impactflow pre-commit \(managed\)/g) ?? [];
    expect(matches.length).toBe(2); // open + close sentinel, not 4
  });

  it('switches mode on re-install', async () => {
    await installPreCommitHook(root, 'warn');
    await installPreCommitHook(root, 'block');
    const content = await readHook();
    expect(content).toContain('# Mode: block');
    expect(content).not.toContain('# Mode: warn');
  });

  it('uninstall removes only the managed block, preserves user content', async () => {
    const userHook = '#!/usr/bin/env bash\nset -eu\n\n# user pre-commit\necho "user hook"\n';
    await fs.writeFile(join(root, '.git', 'hooks', 'pre-commit'), userHook, { mode: 0o755 });
    await installPreCommitHook(root, 'warn');
    const r = await uninstallPreCommitHook(root);
    expect(r.installed).toBe(false);
    const content = await readHook();
    expect(content).toContain('# user pre-commit');
    expect(content).not.toContain('impactflow pre-commit (managed)');
  });

  it('uninstall removes the file entirely if only our managed block existed', async () => {
    await installPreCommitHook(root, 'warn');
    const r = await uninstallPreCommitHook(root);
    expect(r.installed).toBe(false);
    await expect(readHook()).rejects.toThrow();
  });

  it('uninstall is a no-op when no hook exists', async () => {
    const r = await uninstallPreCommitHook(root);
    expect(r.installed).toBe(false);
    expect(r.message).toContain('No pre-commit');
  });
});
