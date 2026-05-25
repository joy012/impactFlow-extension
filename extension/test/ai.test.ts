import { describe, expect, it, vi } from 'vitest';
import { AiResponseCache, buildCacheKey } from '../src/ai/cache.js';
import { explainChangePrompt, suggestTestsPrompt } from '../src/ai/prompts.js';
import { RateLimiter } from '../src/ai/rate-limiter.js';
import type { FnSummary } from '../src/shared/messages.js';

// Inlined to avoid pulling provider.ts (and its `vscode` import) into the test bundle.
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

describe('AI cache', () => {
  it('hits then misses after TTL', () => {
    vi.useFakeTimers();
    const cache = new AiResponseCache(1000);
    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');
    vi.advanceTimersByTime(1500);
    expect(cache.get('k')).toBeUndefined();
    vi.useRealTimers();
  });

  it('evicts LRU on overflow', () => {
    const cache = new AiResponseCache(60_000);
    for (let i = 0; i < 105; i++) cache.set(`k${i}`, String(i));
    expect(cache.get('k0')).toBeUndefined();
    expect(cache.get('k104')).toBe('104');
  });

  it('LRU re-orders on read', () => {
    const cache = new AiResponseCache(60_000);
    for (let i = 0; i < 100; i++) cache.set(`k${i}`, String(i));
    // Touch k0 so it's most-recently-used.
    expect(cache.get('k0')).toBe('0');
    cache.set('k100', '100');
    // k0 should survive; k1 should be the eviction victim.
    expect(cache.get('k0')).toBe('0');
    expect(cache.get('k1')).toBeUndefined();
  });
});

describe('buildCacheKey', () => {
  it("namespaces by kind so different prompts on the same fn don't collide", () => {
    expect(buildCacheKey('id1', 'hash1', 'explain')).not.toEqual(
      buildCacheKey('id1', 'hash1', 'tests'),
    );
  });
});

describe('RateLimiter', () => {
  it('allows first call, blocks subsequent calls within the window', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(60_000);
    expect(limiter.attempt('k').allowed).toBe(true);
    const blocked = limiter.attempt('k');
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
      expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000);
    }
    vi.advanceTimersByTime(60_001);
    expect(limiter.attempt('k').allowed).toBe(true);
    vi.useRealTimers();
  });

  it('tracks keys independently', () => {
    const limiter = new RateLimiter(60_000);
    expect(limiter.attempt('a').allowed).toBe(true);
    expect(limiter.attempt('b').allowed).toBe(true);
    expect(limiter.attempt('a').allowed).toBe(false);
  });
});

describe('estimateTokens', () => {
  it('returns ~length / 4', () => {
    expect(estimateTokens('hello')).toBe(2);
    expect(estimateTokens('a'.repeat(40))).toBe(10);
  });
});

describe('prompt builders', () => {
  const fn: FnSummary = {
    id: '/f.ts::greet',
    name: 'greet',
    kind: 'function',
    line: 10,
    risk: { score: 5.2, level: 'medium', explanation: ['public surface (+2)'] },
    complexity: 4,
    diffs: [{ type: 'signature', severity: 'high', description: 'added param', confidence: 0.9 }],
    impacted: [{ filePath: '/p/a.ts', line: 3, sameFile: false }],
    impactedTests: [{ filePath: '/p/a.test.ts', line: 7, sameFile: false }],
  };

  it('explainChangePrompt includes diff classification + caller list', () => {
    const { userPrompt } = explainChangePrompt(fn, '/p/f.ts', 'function greet() {}');
    expect(userPrompt).toContain('greet');
    expect(userPrompt).toContain('signature');
    expect(userPrompt).toContain('a.ts:3');
    expect(userPrompt).toContain('a.test.ts:7');
    expect(userPrompt).toContain('Implication');
  });

  it('suggestTestsPrompt focuses on writing tests', () => {
    const { systemPrompt, userPrompt } = suggestTestsPrompt(fn, '/p/f.ts', 'function greet() {}');
    expect(systemPrompt).toContain('writing test cases');
    expect(userPrompt).toContain('concrete test cases');
  });

  it('trims function text to 3 000 chars to respect token budget', () => {
    const giant = 'x'.repeat(10_000);
    const { userPrompt } = explainChangePrompt(fn, '/p/f.ts', giant);
    expect(userPrompt).toContain('x'.repeat(3000));
    expect(userPrompt).not.toContain('x'.repeat(3001));
  });
});
