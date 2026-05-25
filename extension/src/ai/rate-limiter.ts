// Per-function rate limiter. Independent windows per key.

export class RateLimiter {
  private readonly lastCallAt = new Map<string, number>();
  constructor(private readonly windowMs: number) {}

  attempt(key: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = Date.now();
    const last = this.lastCallAt.get(key);
    if (last !== undefined && now - last < this.windowMs) {
      return { allowed: false, retryAfterMs: this.windowMs - (now - last) };
    }
    this.lastCallAt.set(key, now);
    return { allowed: true };
  }

  reset(key?: string): void {
    if (key) this.lastCallAt.delete(key);
    else this.lastCallAt.clear();
  }
}
