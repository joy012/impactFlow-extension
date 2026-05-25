import type { BehaviorDiff, Severity } from './behavior-diff/index.js';
import type { FnEntry } from './parsers/typescript/function-table.js';

export type Tier = 'likely' | 'possible';

export interface TierInputs {
  fn: FnEntry;
  diffs: BehaviorDiff[];
  topSeverity: Severity;
  impactedCount: number;
}

export const severityRank = (s: Severity): number => {
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
};

export const pickTier = (i: TierInputs): Tier => {
  // Unexported + no callers = dead code → demote.
  if (!i.fn.isExported && i.impactedCount === 0) return 'possible';

  const maxConf = i.diffs.reduce((acc, d) => Math.max(acc, d.confidence), 0);
  if (maxConf >= 0.7) return 'likely';
  if (maxConf >= 0.4 && severityRank(i.topSeverity) >= severityRank('medium')) return 'likely';
  return 'possible';
};

export const passesSeverityThreshold = (s: Severity, minimum: string): boolean => {
  if (minimum === 'all') return true;
  return severityRank(s) >= severityRank(minimum as Severity);
};
