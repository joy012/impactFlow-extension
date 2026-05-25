/**
 * Semantic Impact Analyzer — Phase 3.
 */

import type { BehaviorDiff, Severity } from '../behavior-diff/index.js';

export interface ImpactResult {
  source: { file: string; function?: string };
  diffs: BehaviorDiff[];
  affectedModules: Array<{
    file: string;
    function?: string;
    distance: number;
    confidence: number;
    isPublicSurface: boolean;
  }>;
  riskLevel: Severity;
  explanation: string[];
}

export function computeImpact(): ImpactResult[] {
  // Phase 3.
  return [];
}
