// LRU cache for AI responses, keyed by (fnId + bodyHash + kind). 24h TTL by default.
// Survives only the extension session — intentionally not persisted, so the next
// VS Code start re-issues fresh prompts.

interface CacheEntry {
  value: string;
  at: number;
}

const MAX_ENTRIES = 100;

export class AiResponseCache {
  private readonly map = new Map<string, CacheEntry>();
  constructor(private readonly ttlMs: number) {}

  get(key: string): string | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    // LRU touch.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: string): void {
    if (this.map.size >= MAX_ENTRIES) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, at: Date.now() });
  }

  clear(): void {
    this.map.clear();
  }
}

export const buildCacheKey = (fnId: string, bodyHash: string, kind: string): string =>
  `${kind}::${fnId}::${bodyHash}`;
