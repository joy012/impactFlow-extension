/**
 * Baselines — what we compare the current working tree against.
 * Phase 1 ships GitHeadBaseline; Phase 3 adds BranchBaseBaseline.
 */

import { relative } from 'node:path';
import { type SimpleGit, simpleGit } from 'simple-git';
import { logger } from '../logger.js';

export interface Baseline {
  /**
   * Returns the baseline content of the file, or null if the file does not
   * exist in the baseline (new file, untracked, outside repo).
   */
  getFile(absPath: string): Promise<string | null>;
}

export class GitHeadBaseline implements Baseline {
  private readonly git: SimpleGit;

  constructor(private readonly workspaceRoot: string) {
    this.git = simpleGit(workspaceRoot);
  }

  async getFile(absPath: string): Promise<string | null> {
    const rel = relative(this.workspaceRoot, absPath);
    if (rel.startsWith('..')) return null; // outside repo
    try {
      return await this.git.show([`HEAD:${rel.replaceAll('\\', '/')}`]);
    } catch (err) {
      // File is new (not in HEAD) or repo is bare. Both produce a non-null error.
      logger.debug(`baseline miss for ${rel}: ${(err as Error).message.split('\n')[0]}`);
      return null;
    }
  }
}

/** Used when the workspace is not a git repo or before any commit exists. */
export class EmptyBaseline implements Baseline {
  async getFile(): Promise<string | null> {
    return null;
  }
}

/**
 * Baseline = merge-base(HEAD, target branch). Used for commit-time summaries.
 * Falls back to HEAD if the merge-base cannot be computed.
 */
export class BranchBaseBaseline implements Baseline {
  private readonly git: SimpleGit;
  private mergeBaseSha: string | undefined;

  constructor(
    private readonly workspaceRoot: string,
    private readonly target: string = 'main',
  ) {
    this.git = simpleGit(workspaceRoot);
  }

  private async resolveBase(): Promise<string> {
    if (this.mergeBaseSha) return this.mergeBaseSha;
    for (const candidate of [this.target, 'master', 'trunk']) {
      try {
        const sha = (await this.git.raw(['merge-base', 'HEAD', candidate])).trim();
        if (sha) {
          this.mergeBaseSha = sha;
          return sha;
        }
      } catch {
        /* try next candidate */
      }
    }
    this.mergeBaseSha = 'HEAD';
    return 'HEAD';
  }

  async getFile(absPath: string): Promise<string | null> {
    const rel = relative(this.workspaceRoot, absPath);
    if (rel.startsWith('..')) return null;
    try {
      const base = await this.resolveBase();
      return await this.git.show([`${base}:${rel.replaceAll('\\', '/')}`]);
    } catch (err) {
      logger.debug(`branch-base miss for ${rel}: ${(err as Error).message.split('\n')[0]}`);
      return null;
    }
  }

  async changedFiles(): Promise<string[]> {
    try {
      const base = await this.resolveBase();
      const raw = await this.git.diff([`${base}...HEAD`, '--name-only']);
      return raw
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((rel) => `${this.workspaceRoot}/${rel}`);
    } catch (err) {
      logger.debug(`branch-base file list failed: ${(err as Error).message.split('\n')[0]}`);
      return [];
    }
  }
}
