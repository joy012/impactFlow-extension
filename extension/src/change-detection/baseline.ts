import { relative } from 'node:path';
import { type SimpleGit, simpleGit } from 'simple-git';
import { logger } from '../logger.js';

export interface Baseline {
  /** Baseline content of `absPath`, or null when missing (new/untracked/outside repo). */
  getFile(absPath: string): Promise<string | null>;
}

export class GitHeadBaseline implements Baseline {
  private readonly git: SimpleGit;

  constructor(private readonly workspaceRoot: string) {
    this.git = simpleGit(workspaceRoot);
  }

  async getFile(absPath: string): Promise<string | null> {
    const rel = relative(this.workspaceRoot, absPath);
    if (rel.startsWith('..')) return null;
    try {
      return await this.git.show([`HEAD:${rel.replaceAll('\\', '/')}`]);
    } catch (err) {
      logger.debug(`baseline miss for ${rel}: ${(err as Error).message.split('\n')[0]}`);
      return null;
    }
  }
}

export class EmptyBaseline implements Baseline {
  async getFile(): Promise<string | null> {
    return null;
  }
}

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
