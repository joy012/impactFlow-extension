/**
 * Single source of truth for "is this workspace a git repo?"
 * Cached per-session; recomputed on workspace change.
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

let cached: { root: string; isGit: boolean } | undefined;

export function isGitRepo(workspaceRoot: string | undefined): boolean {
  if (!workspaceRoot) return false;
  if (cached?.root === workspaceRoot) return cached.isGit;
  let isGit = false;
  try {
    const dotgit = join(workspaceRoot, '.git');
    if (existsSync(dotgit)) {
      // .git can be a directory (normal repo) or a file (worktree / submodule).
      const s = statSync(dotgit);
      isGit = s.isDirectory() || s.isFile();
    }
  } catch {
    isGit = false;
  }
  cached = { root: workspaceRoot, isGit };
  return isGit;
}

export function clearGitDetectCache(): void {
  cached = undefined;
}
