/**
 * Phase 4 — false-positive filtering rules and tier assignment.
 */

import type { BehaviorDiff, Severity } from './behavior-diff/index.js';
import type { FnEntry } from './parsers/typescript/function-table.js';

export type Tier = 'likely' | 'possible';

export interface TierInputs {
  fn: FnEntry;
  diffs: BehaviorDiff[];
  topSeverity: Severity;
  impactedCount: number;
}

/**
 * Decide the visibility tier per docs/DONE.md:
 *
 *   Likely:    max(confidence) ≥ 0.7
 *           OR (max(confidence) ≥ 0.4 AND topSeverity ≥ medium)
 *   Possible:  everything else, including dead code (no callers, not exported).
 */
export function pickTier(i: TierInputs): Tier {
  // Dead-code demotion: unexported AND no callers in workspace.
  if (!i.fn.isExported && i.impactedCount === 0) return 'possible';

  const maxConf = i.diffs.reduce((acc, d) => Math.max(acc, d.confidence), 0);
  if (maxConf >= 0.7) return 'likely';
  if (maxConf >= 0.4 && severityRank(i.topSeverity) >= severityRank('medium')) return 'likely';
  return 'possible';
}

export function severityRank(s: Severity): number {
  switch (s) {
    case 'safe':
      return 0;
    case 'low':
      return 1;
    case 'medium':
      return 2;
    case 'high':
      return 3;
  }
}

/** Severity threshold from settings ("all" | "low" | "medium" | "high"). */
export function passesSeverityThreshold(s: Severity, minimum: string): boolean {
  if (minimum === 'all') return true;
  const min = severityRank(minimum as Severity);
  return severityRank(s) >= min;
}
