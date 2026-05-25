import type { Severity } from './index.js';

export const pickTopSeverity = (severities: Severity[]): Severity => {
  if (severities.includes('high')) return 'high';
  if (severities.includes('medium')) return 'medium';
  if (severities.includes('low')) return 'low';
  return 'safe';
};
