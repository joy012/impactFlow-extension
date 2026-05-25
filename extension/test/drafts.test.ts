import { describe, expect, it } from 'vitest';
import { pickTopSeverity } from '../src/behavior-diff/severity.js';

// pickTopSeverity is the only piece of the drafts pipeline that has no vscode dep;
// the rest (collectChanges) requires the workspace API. Integration test covers the full flow.
describe('pickTopSeverity', () => {
  it('returns high when any high is present', () => {
    expect(pickTopSeverity(['low', 'high', 'medium'])).toBe('high');
  });
  it('falls back to medium when no high', () => {
    expect(pickTopSeverity(['low', 'medium', 'safe'])).toBe('medium');
  });
  it('falls back to low when no medium', () => {
    expect(pickTopSeverity(['safe', 'low'])).toBe('low');
  });
  it('returns safe for empty', () => {
    expect(pickTopSeverity([])).toBe('safe');
  });
  it('returns safe when only safe', () => {
    expect(pickTopSeverity(['safe', 'safe'])).toBe('safe');
  });
});
