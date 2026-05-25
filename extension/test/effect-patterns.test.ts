import { describe, expect, it } from 'vitest';
import { detectEffects } from '../src/behavior-diff/effect-patterns.js';

describe('detectEffects', () => {
  it('detects fetch as network', () => {
    expect(detectEffects('fetch("/api")').has('network')).toBe(true);
  });
  it('detects axios as network', () => {
    expect(detectEffects('axios.get(url)').has('network')).toBe(true);
  });
  it('detects fs.readFile as fs', () => {
    expect(detectEffects('fs.readFile(p, cb)').has('fs')).toBe(true);
  });
  it('detects process.env as env', () => {
    expect(detectEffects('const k = process.env.KEY').has('env')).toBe(true);
  });
  it('detects document.* as dom', () => {
    expect(detectEffects('document.querySelector(".x")').has('dom')).toBe(true);
  });
  it('detects console.log as console', () => {
    expect(detectEffects('console.log("hi")').has('console')).toBe(true);
  });
  it('returns empty set for pure code', () => {
    const eff = detectEffects('function add(a, b) { return a + b; }');
    expect(eff.size).toBe(0);
  });
});
