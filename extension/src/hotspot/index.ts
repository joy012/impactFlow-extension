import { type SimpleGit, simpleGit } from 'simple-git';
import { logger } from '../logger.js';

interface FileHotness {
  path: string;
  commits: number;
  linesAdded: number;
  linesDeleted: number;
  lastCommit: string;
}

const MAX_HOTSPOT_CACHE = 500;
const NEGATIVE_TTL_MS = 30_000;

export class HotspotEngine {
  private readonly cache = new Map<string, FileHotness>();
  // N3 — short-TTL negative cache so a failed lookup doesn't re-shell-out per analysis pass.
  private readonly negativeCache = new Map<string, number>();
  private readonly git: SimpleGit | null;
  private maxCommits = 0;
  private readonly windowDays: number;

  constructor(workspaceRoot: string, windowDays = 90) {
    this.windowDays = windowDays;
    try {
      this.git = simpleGit(workspaceRoot);
    } catch {
      this.git = null;
    }
  }

  async refresh(filePath: string): Promise<FileHotness | null> {
    if (!this.git) return null;
    if (this.cache.has(filePath)) return this.cache.get(filePath)!;
    const failedAt = this.negativeCache.get(filePath);
    if (failedAt && Date.now() - failedAt < NEGATIVE_TTL_MS) return null;

    try {
      const since = new Date(Date.now() - this.windowDays * 86_400_000).toISOString().slice(0, 10);
      const raw = await this.git.raw([
        'log',
        '--follow',
        '--numstat',
        `--since=${since}`,
        '--pretty=format:%h',
        '--',
        filePath,
      ]);
      const hot = parseGitLog(filePath, raw);
      this.cache.delete(filePath);
      this.cache.set(filePath, hot);
      this.negativeCache.delete(filePath);
      if (this.cache.size > MAX_HOTSPOT_CACHE) {
        const oldest = this.cache.keys().next().value;
        if (oldest) this.cache.delete(oldest);
      }
      if (hot.commits > this.maxCommits) this.maxCommits = hot.commits;
      return hot;
    } catch (err) {
      logger.debug(`hotspot lookup failed for ${filePath}: ${(err as Error).message}`);
      this.negativeCache.set(filePath, Date.now());
      return null;
    }
  }

  /** Normalized hotness 0..1 across files seen this session. */
  score(filePath: string): number {
    const h = this.cache.get(filePath);
    if (!h || this.maxCommits === 0) return 0;
    return Math.min(1, h.commits / this.maxCommits);
  }

  isHot(filePath: string, threshold = 0.6): boolean {
    return this.score(filePath) >= threshold;
  }

  details(filePath: string): FileHotness | null {
    return this.cache.get(filePath) ?? null;
  }

  clear(): void {
    this.cache.clear();
    this.negativeCache.clear();
    this.maxCommits = 0;
  }
}

// Each commit = one `%h` line followed by zero or more `added\tdeleted\tpath` numstat rows.
const parseGitLog = (filePath: string, raw: string): FileHotness => {
  let commits = 0;
  let added = 0;
  let deleted = 0;
  let lastCommit = '';

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[0-9a-f]{6,40}$/i.test(trimmed)) {
      if (!lastCommit) lastCommit = trimmed;
      commits++;
      continue;
    }
    const m = /^(\d+|-)\t(\d+|-)\t/.exec(line);
    if (m) {
      added += m[1] === '-' ? 0 : Number.parseInt(m[1]!, 10);
      deleted += m[2] === '-' ? 0 : Number.parseInt(m[2]!, 10);
    }
  }

  return { path: filePath, commits, linesAdded: added, linesDeleted: deleted, lastCommit };
};
