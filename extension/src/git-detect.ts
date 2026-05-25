import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Cache the .git lookup but invalidate after a short TTL so `git init` mid-session is picked up.
const TTL_MS = 60_000;
let cached: { root: string; isGit: boolean; at: number } | undefined;

export const isGitRepo = (workspaceRoot: string | undefined): boolean => {
  if (!workspaceRoot) return false;
  if (cached?.root === workspaceRoot && Date.now() - cached.at < TTL_MS) {
    return cached.isGit;
  }
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
  cached = { root: workspaceRoot, isGit, at: Date.now() };
  return isGit;
};

export const clearGitDetectCache = (): void => {
  cached = undefined;
};
