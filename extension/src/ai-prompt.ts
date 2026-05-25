/**
 * F11 — AI prompt template generator.
 * Builds a copy-pasteable prompt for Claude / Copilot / Cursor describing the change.
 */

import type { FnSummary } from './shared/messages.js';

export function buildAiPrompt(fn: FnSummary, filePath: string): string {
  const lines: string[] = [];
  lines.push(
    `I changed \`${fn.name}\` in \`${shorten(filePath)}\` (line ${fn.line}).`,
    '',
    'Detected behavioral changes:',
  );
  for (const d of fn.diffs ?? []) {
    lines.push(`- **${d.type}** (${d.severity}): ${d.description}`);
  }
  if (fn.complexity != null) {
    lines.push(`- Cyclomatic complexity: ${fn.complexity}`);
  }

  if (fn.impacted && fn.impacted.length > 0) {
    lines.push('', 'Likely-affected call sites (review these):');
    for (const r of fn.impacted.slice(0, 10)) {
      lines.push(`- ${shorten(r.filePath)}:${r.line}`);
    }
  }

  if (fn.impactedTests && fn.impactedTests.length > 0) {
    lines.push('', 'Tests that exercise this function:');
    for (const r of fn.impactedTests.slice(0, 10)) {
      lines.push(`- ${shorten(r.filePath)}:${r.line}`);
    }
  }

  lines.push(
    '',
    'Please:',
    '1. Verify the new behavior preserves the existing contract for all callers.',
    '2. Suggest test cases that would have caught any regression.',
    '3. Call out any caller that needs to be updated.',
  );

  return lines.join('\n');
}

function shorten(p: string): string {
  return p.split(/[\\/]/).slice(-3).join('/');
}
