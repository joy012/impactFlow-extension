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

export class HotspotEngine {
  private readonly cache = new Map<string, FileHotness>();
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
    try {
      const since = new Date(Date.now() - this.windowDays * 86_400_000).toISOString().slice(0, 10);
      // --follow tracks renames; --numstat gives per-file line counts; -- limits to this file
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
      if (this.cache.size > MAX_HOTSPOT_CACHE) {
        const oldest = this.cache.keys().next().value;
        if (oldest) this.cache.delete(oldest);
      }
      if (hot.commits > this.maxCommits) this.maxCommits = hot.commits;
      return hot;
    } catch (err) {
      logger.debug(`hotspot lookup failed for ${filePath}: ${(err as Error).message}`);
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

  /** Detailed snapshot for the side panel hover. */
  details(filePath: string): FileHotness | null {
    return this.cache.get(filePath) ?? null;
  }

  clear(): void {
    this.cache.clear();
    this.maxCommits = 0;
  }
}

/**
 * Parse `git log --numstat --pretty=format:%h` output. Each commit emits a
 * one-line `%h` followed by zero or more `added\tdeleted\tpath` lines (one per
 * file). With `-- <file>` we usually see one numstat row per commit.
 */
function parseGitLog(filePath: string, raw: string): FileHotness {
  let commits = 0;
  let added = 0;
  let deleted = 0;
  let lastCommit = '';
  let currentSha: string | null = null;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[0-9a-f]{6,40}$/i.test(trimmed)) {
      currentSha = trimmed;
      if (!lastCommit) lastCommit = trimmed;
      commits++;
      continue;
    }
    const m = /^(\d+|-)\t(\d+|-)\t/.exec(line);
    if (m) {
      const a = m[1] === '-' ? 0 : Number.parseInt(m[1]!, 10);
      const d = m[2] === '-' ? 0 : Number.parseInt(m[2]!, 10);
      added += a;
      deleted += d;
    }
  }

  return { path: filePath, commits, linesAdded: added, linesDeleted: deleted, lastCommit };
}
