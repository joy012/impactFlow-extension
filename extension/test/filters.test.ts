import { describe, expect, it } from 'vitest';
import type { BehaviorDiff } from '../src/behavior-diff/index.js';
import { passesSeverityThreshold, pickTier, severityRank } from '../src/filters.js';
import type { FnEntry } from '../src/parsers/typescript/function-table.js';

function fn(overrides: Partial<FnEntry> = {}): FnEntry {
  return {
    id: '/v::f',
    name: 'f',
    kind: 'function',
    startLine: 1,
    endLine: 1,
    bodyHash: 'x',
    fullText: '',
    filePath: '/v',
    isExported: false,
    ...overrides,
  };
}

const HC: BehaviorDiff = { type: 'signature', severity: 'high', description: '', confidence: 0.9 };
const LC: BehaviorDiff = { type: 'call_set', severity: 'low', description: '', confidence: 0.5 };

describe('pickTier', () => {
  it('demotes unexported function with no callers to possible (dead-code)', () => {
    const t = pickTier({ fn: fn(), diffs: [HC], topSeverity: 'high', impactedCount: 0 });
    expect(t).toBe('possible');
  });

  it('high-confidence signature change on exported fn is likely', () => {
    const t = pickTier({
      fn: fn({ isExported: true }),
      diffs: [HC],
      topSeverity: 'high',
      impactedCount: 0,
    });
    expect(t).toBe('likely');
  });

  it('mid-confidence + medium severity is likely', () => {
    const t = pickTier({
      fn: fn({ isExported: true }),
      diffs: [{ ...LC, confidence: 0.5, severity: 'medium' }],
      topSeverity: 'medium',
      impactedCount: 2,
    });
    expect(t).toBe('likely');
  });

  it('low-confidence + low severity is possible', () => {
    const t = pickTier({
      fn: fn({ isExported: true }),
      diffs: [LC],
      topSeverity: 'low',
      impactedCount: 1,
    });
    expect(t).toBe('possible');
  });
});

describe('passesSeverityThreshold', () => {
  it('"all" accepts everything', () => {
    expect(passesSeverityThreshold('safe', 'all')).toBe(true);
    expect(passesSeverityThreshold('high', 'all')).toBe(true);
  });

  it('"medium" rejects low/safe', () => {
    expect(passesSeverityThreshold('safe', 'medium')).toBe(false);
    expect(passesSeverityThreshold('low', 'medium')).toBe(false);
    expect(passesSeverityThreshold('medium', 'medium')).toBe(true);
    expect(passesSeverityThreshold('high', 'medium')).toBe(true);
  });

  it('"high" accepts only high', () => {
    expect(passesSeverityThreshold('medium', 'high')).toBe(false);
    expect(passesSeverityThreshold('high', 'high')).toBe(true);
  });
});

describe('severityRank', () => {
  it('is monotonic', () => {
    expect(severityRank('safe')).toBeLessThan(severityRank('low'));
    expect(severityRank('low')).toBeLessThan(severityRank('medium'));
    expect(severityRank('medium')).toBeLessThan(severityRank('high'));
  });
});
