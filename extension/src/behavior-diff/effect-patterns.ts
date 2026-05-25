/**
 * Effect patterns — syntactic proxy for side-effect surface.
 * See docs/DONE.md: we detect known patterns, not effects in general.
 */

export type EffectKind = 'network' | 'fs' | 'env' | 'dom' | 'globals' | 'console' | 'mutation';

export interface EffectPattern {
  kind: EffectKind;
  match: RegExp;
}

/** Surface a stable text fingerprint when a function references one of these. */
export const EFFECT_PATTERNS: EffectPattern[] = [
  // network
  { kind: 'network', match: /\bfetch\s*\(/ },
  { kind: 'network', match: /\baxios\.[a-z]+\s*\(/i },
  { kind: 'network', match: /\bhttp[s]?\.(get|post|put|delete|request)\s*\(/ },
  { kind: 'network', match: /\bXMLHttpRequest\b/ },

  // filesystem
  { kind: 'fs', match: /\bfs\.[a-z]+\s*\(/i },
  { kind: 'fs', match: /\bfs\/promises\b/ },
  { kind: 'fs', match: /\bfsPromises\.[a-z]+\s*\(/i },
  { kind: 'fs', match: /\breadFile|writeFile|unlink|mkdir|rmdir|stat\b\s*\(/ },

  // environment
  { kind: 'env', match: /\bprocess\.env\b/ },
  { kind: 'env', match: /\bos\.[a-z]+\s*\(/i },

  // DOM
  { kind: 'dom', match: /\bdocument\.[a-z]+/i },
  { kind: 'dom', match: /\bwindow\.[a-z]+/i },
  { kind: 'dom', match: /\blocalStorage|sessionStorage\b/ },

  // global mutation surface
  { kind: 'globals', match: /\bglobalThis\b/ },

  // diagnostic / side-effecting console
  { kind: 'console', match: /\bconsole\.[a-z]+\s*\(/i },
];

export function detectEffects(text: string): Set<EffectKind> {
  const found = new Set<EffectKind>();
  for (const p of EFFECT_PATTERNS) {
    if (p.match.test(text)) found.add(p.kind);
  }
  return found;
}
