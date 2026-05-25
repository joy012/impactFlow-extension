import { describe, expect, it } from 'vitest';
import {
  SEVERITY_ORDER,
  initialsOf,
  kindIcon,
  labelForDiff,
  passesSeverityFilter,
  shortenPath,
} from './utils.js';

describe('initialsOf', () => {
  it('extracts up to 3 initials', () => {
    expect(initialsOf('joy chowdhury')).toBe('JC');
    expect(initialsOf('Alice Bob Charlie David')).toBe('ABC');
    expect(initialsOf('single')).toBe('S');
  });
  it('handles empty input safely', () => {
    expect(initialsOf('')).toBe('');
    expect(initialsOf('   ')).toBe('');
  });
});

describe('shortenPath', () => {
  it('keeps the last 3 segments by default', () => {
    expect(shortenPath('/a/b/c/d/e.ts')).toBe('c/d/e.ts');
  });
  it('handles Windows-style separators', () => {
    expect(shortenPath('C:\\a\\b\\c\\d.ts')).toBe('b/c/d.ts');
  });
  it('accepts a segment count', () => {
    expect(shortenPath('/a/b/c/d.ts', 2)).toBe('c/d.ts');
  });
});

describe('kindIcon', () => {
  it('maps each kind to its glyph', () => {
    expect(kindIcon('function')).toBe('ƒ');
    expect(kindIcon('method')).toBe('m');
    expect(kindIcon('arrow')).toBe('⇒');
    expect(kindIcon('default-export')).toBe('★');
  });
});

describe('labelForDiff', () => {
  it('maps every diff type', () => {
    expect(labelForDiff('signature')).toBe('signature');
    expect(labelForDiff('branch_logic')).toBe('branch');
    expect(labelForDiff('side_effect_surface')).toBe('effects');
    expect(labelForDiff('complexity_jump')).toBe('complexity');
    expect(labelForDiff('stale_doc')).toBe('stale-doc');
  });
});

describe('passesSeverityFilter', () => {
  it('"all" lets everything through', () => {
    expect(passesSeverityFilter('safe', 'all')).toBe(true);
    expect(passesSeverityFilter('high', 'all')).toBe(true);
  });
  it('"medium" keeps medium + high', () => {
    expect(passesSeverityFilter('safe', 'medium')).toBe(false);
    expect(passesSeverityFilter('low', 'medium')).toBe(false);
    expect(passesSeverityFilter('medium', 'medium')).toBe(true);
    expect(passesSeverityFilter('high', 'medium')).toBe(true);
  });
  it('"high" keeps only high', () => {
    expect(passesSeverityFilter('medium', 'high')).toBe(false);
    expect(passesSeverityFilter('high', 'high')).toBe(true);
  });
  it('defaults undefined severity to low', () => {
    expect(passesSeverityFilter(undefined, 'medium')).toBe(false);
    expect(passesSeverityFilter(undefined, 'low')).toBe(true);
  });
});

describe('SEVERITY_ORDER', () => {
  it('is a strict ascending order', () => {
    expect(SEVERITY_ORDER.safe).toBeLessThan(SEVERITY_ORDER.low);
    expect(SEVERITY_ORDER.low).toBeLessThan(SEVERITY_ORDER.medium);
    expect(SEVERITY_ORDER.medium).toBeLessThan(SEVERITY_ORDER.high);
  });
});
