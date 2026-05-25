import type { BehaviorDiffType, FnSummary, Severity } from './shared/messages.js';

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 3);

export const shortenPath = (absPath: string, segments = 3): string => {
  const parts = absPath.split(/[\\/]/);
  return parts.slice(-segments).join('/');
};

export const kindIcon = (k: FnSummary['kind']): string => {
  switch (k) {
    case 'function':
      return 'ƒ';
    case 'method':
      return 'm';
    case 'arrow':
      return '⇒';
    case 'default-export':
      return '★';
  }
};

export const labelForDiff = (t: BehaviorDiffType): string => {
  switch (t) {
    case 'signature':
      return 'signature';
    case 'branch_logic':
      return 'branch';
    case 'return_shape':
      return 'return';
    case 'call_set':
      return 'calls';
    case 'throw_set':
      return 'throws';
    case 'asyncness':
      return 'async';
    case 'side_effect_surface':
      return 'effects';
    case 'stale_doc':
      return 'stale-doc';
    case 'complexity_jump':
      return 'complexity';
  }
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  safe: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export const passesSeverityFilter = (
  fnSev: Severity | undefined,
  filter: 'all' | 'low' | 'medium' | 'high',
): boolean => {
  if (filter === 'all') return true;
  return SEVERITY_ORDER[fnSev ?? 'low'] >= SEVERITY_ORDER[filter];
};
