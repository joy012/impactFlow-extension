/**
 * Composite risk score. docs/DONE.md
 *
 *   risk = clamp(
 *       severityWeight(topSeverity)
 *     + 2 * (isPublicSurface ? 1 : 0)
 *     + 1 * log2(1 + impactedCount)
 *     + 1 * (crossesPackageBoundary ? 1 : 0)
 *     + 1 * (touchesAsyncBoundary ? 1 : 0)
 *   , 0, 10)
 *
 *   bucket: 0–1 SAFE · 2–3 LOW · 4–6 MEDIUM · 7–10 HIGH
 */

import type { Severity } from '../behavior-diff/index.js';

export interface RiskInputs {
  topSeverity: Severity;
  isPublicSurface: boolean;
  impactedCount: number;
  crossesPackageBoundary: boolean;
  touchesAsyncBoundary: boolean;
}

export interface RiskOutput {
  score: number;
  level: Severity;
  explanation: string[];
}

export function severityWeight(s: Severity): number {
  switch (s) {
    case 'safe':
      return 0;
    case 'low':
      return 1;
    case 'medium':
      return 2;
    case 'high':
      return 4;
  }
}

export function bucket(score: number): Severity {
  if (score <= 1) return 'safe';
  if (score <= 3) return 'low';
  if (score <= 6) return 'medium';
  return 'high';
}

export function computeRisk(i: RiskInputs): RiskOutput {
  const expl: string[] = [];
  let score = severityWeight(i.topSeverity);
  if (score > 0) expl.push(`${i.topSeverity} change (+${severityWeight(i.topSeverity)})`);

  if (i.isPublicSurface) {
    score += 2;
    expl.push('public surface (+2)');
  }
  const impactTerm = Math.log2(1 + i.impactedCount);
  if (impactTerm > 0) {
    score += impactTerm;
    expl.push(
      `${i.impactedCount} caller${i.impactedCount === 1 ? '' : 's'} (+${impactTerm.toFixed(1)})`,
    );
  }
  if (i.crossesPackageBoundary) {
    score += 1;
    expl.push('crosses package boundary (+1)');
  }
  if (i.touchesAsyncBoundary) {
    score += 1;
    expl.push('touches async boundary (+1)');
  }
  score = Math.max(0, Math.min(10, score));
  return { score, level: bucket(score), explanation: expl };
}
