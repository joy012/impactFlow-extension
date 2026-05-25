import { describe, expect, it } from 'vitest';
import { bucket, computeRisk, severityWeight } from '../src/risk/formula.js';

describe('severityWeight', () => {
  it('orders safe < low < medium < high', () => {
    expect(severityWeight('safe')).toBeLessThan(severityWeight('low'));
    expect(severityWeight('low')).toBeLessThan(severityWeight('medium'));
    expect(severityWeight('medium')).toBeLessThan(severityWeight('high'));
  });
});

describe('bucket', () => {
  it('maps scores to severities per docs/DONE.md', () => {
    expect(bucket(0)).toBe('safe');
    expect(bucket(1)).toBe('safe');
    expect(bucket(2)).toBe('low');
    expect(bucket(3)).toBe('low');
    expect(bucket(4)).toBe('medium');
    expect(bucket(6)).toBe('medium');
    expect(bucket(7)).toBe('high');
    expect(bucket(10)).toBe('high');
  });
});

describe('computeRisk', () => {
  it('a safe internal change with no callers stays safe', () => {
    const r = computeRisk({
      topSeverity: 'safe',
      isPublicSurface: false,
      impactedCount: 0,
      crossesPackageBoundary: false,
      touchesAsyncBoundary: false,
    });
    expect(r.level).toBe('safe');
  });

  it('a high-severity public change with many callers is high', () => {
    const r = computeRisk({
      topSeverity: 'high',
      isPublicSurface: true,
      impactedCount: 30,
      crossesPackageBoundary: true,
      touchesAsyncBoundary: true,
    });
    expect(r.level).toBe('high');
    expect(r.score).toBeGreaterThanOrEqual(7);
  });

  it('clamps to 10', () => {
    const r = computeRisk({
      topSeverity: 'high',
      isPublicSurface: true,
      impactedCount: 10000,
      crossesPackageBoundary: true,
      touchesAsyncBoundary: true,
    });
    expect(r.score).toBeLessThanOrEqual(10);
  });

  it('explanation lists each contributing factor', () => {
    const r = computeRisk({
      topSeverity: 'medium',
      isPublicSurface: true,
      impactedCount: 3,
      crossesPackageBoundary: false,
      touchesAsyncBoundary: false,
    });
    expect(r.explanation.join('|')).toContain('medium');
    expect(r.explanation.join('|')).toContain('public surface');
    expect(r.explanation.join('|')).toContain('caller');
  });
});
