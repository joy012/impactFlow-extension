/**
 * F6 — Last-touched badge.
 * Uses `git log -L <start>,<end>:<file>` to find the most recent commit that
 * touched a function's line range. Cached per (file, range, hash) tuple.
 */

import { relative } from 'node:path';
import { type SimpleGit, simpleGit } from 'simple-git';
import { logger } from '../logger.js';

export interface LastTouched {
  sha: string;
  author: string;
  isoDate: string;
}

const MAX_CACHE = 500;

export class LastTouchedEngine {
  private readonly git: SimpleGit | null;
  private readonly cache = new Map<string, LastTouched | null>();

  constructor(workspaceRoot: string) {
    try {
      this.git = simpleGit(workspaceRoot);
    } catch {
      this.git = null;
    }
  }

  async lookup(filePath: string, startLine: number, endLine: number): Promise<LastTouched | null> {
    if (!this.git) return null;
    const key = `${filePath}:${startLine}:${endLine}`;
    if (this.cache.has(key)) return this.cache.get(key) ?? null;
    try {
      const rel = relative(process.cwd(), filePath).replaceAll('\\', '/');
      // git log -L <start>,<end>:<file> -1 --pretty=format:%H|%an|%aI -s
      const raw = await this.git.raw([
        'log',
        `-L${startLine},${endLine}:${filePath}`,
        '-1',
        '--pretty=format:%H|%an|%aI',
        '-s',
      ]);
      const firstLine = raw.split('\n')[0]?.trim();
      if (!firstLine || !firstLine.includes('|')) {
        this.cache.set(key, null);
        return null;
      }
      const [sha, author, isoDate] = firstLine.split('|');
      if (!sha || !author || !isoDate) {
        this.cache.set(key, null);
        return null;
      }
      const result: LastTouched = { sha: sha.slice(0, 7), author, isoDate };
      this.cache.delete(key);
      this.cache.set(key, result);
      if (this.cache.size > MAX_CACHE) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
      logger.debug(
        `last-touched ${rel}:${startLine}-${endLine} = ${result.sha} by ${result.author}`,
      );
      return result;
    } catch (err) {
      // `-L` requires the file to exist in HEAD. New files throw here — quiet.
      logger.debug(`last-touched lookup failed: ${(err as Error).message.split('\n')[0]}`);
      this.cache.set(key, null);
      return null;
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
