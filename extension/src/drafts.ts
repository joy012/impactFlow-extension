/**
 * F4 / F5 — short commit-message + long PR-description drafts.
 * Both built from the existing branch-base summary; differ only in shape.
 */

import { diffBehavior } from './behavior-diff/index.js';
import { BranchBaseBaseline } from './change-detection/baseline.js';
import { findReferences } from './impact/references.js';
import { buildFunctionTable, languageFor } from './parsers/router.js';
import { diffFunctionTables, emptyTable } from './parsers/typescript/diff-functions.js';
import { computeRisk } from './risk/formula.js';

interface ChangeSummary {
  filePath: string;
  fn: string;
  level: 'safe' | 'low' | 'medium' | 'high';
  diffTypes: string[];
}

async function collect(workspaceRoot: string): Promise<ChangeSummary[]> {
  const baseline = new BranchBaseBaseline(workspaceRoot);
  const files = await baseline.changedFiles();
  const out: ChangeSummary[] = [];
  for (const filePath of files) {
    if (!languageFor(filePath)) continue;
    const currentText = await safeRead(filePath);
    if (currentText === null) continue;
    const baselineText = await baseline.getFile(filePath);
    const before = baselineText ? buildFunctionTable(filePath, baselineText) : emptyTable(filePath);
    const after = buildFunctionTable(filePath, currentText);
    const td = diffFunctionTables(before, after);
    for (const { before: b, after: a } of td.modified) {
      const bd = diffBehavior(b, a);
      if (bd.pureRenameOrFormatting || bd.diffs.length === 0) continue;
      const top = pickTop(bd.diffs.map((d) => d.severity));
      const refs = await findReferences(filePath, a.name, a.startLine);
      const risk = computeRisk({
        topSeverity: top,
        isPublicSurface: a.isExported,
        impactedCount: refs.length,
        crossesPackageBoundary: false,
        touchesAsyncBoundary: bd.diffs.some((d) => d.type === 'asyncness'),
      });
      out.push({
        filePath,
        fn: a.name,
        level: risk.level,
        diffTypes: bd.diffs.map((d) => d.type),
      });
    }
  }
  return out;
}

async function safeRead(filePath: string): Promise<string | null> {
  try {
    const fs = await import('node:fs/promises');
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function pickTop(
  severities: Array<'safe' | 'low' | 'medium' | 'high'>,
): 'safe' | 'low' | 'medium' | 'high' {
  if (severities.includes('high')) return 'high';
  if (severities.includes('medium')) return 'medium';
  if (severities.includes('low')) return 'low';
  return 'safe';
}

/** Short, paste-into-`git commit -m` style. */
export async function draftCommitMessage(workspaceRoot: string): Promise<string> {
  const items = await collect(workspaceRoot);
  if (items.length === 0) return 'chore: no behavior changes vs. branch base';

  const high = items.filter((i) => i.level === 'high').length;
  const medium = items.filter((i) => i.level === 'medium').length;
  const verb = inferVerb(items);
  const subject =
    items.length === 1
      ? `${verb} ${items[0]!.fn}`
      : `${verb} ${items.length} function${items.length === 1 ? '' : 's'}`;

  const body: string[] = [];
  for (const i of items.slice(0, 5)) {
    body.push(`- ${i.fn} (${i.level}): ${i.diffTypes.slice(0, 3).join(', ')}`);
  }
  if (items.length > 5) body.push(`- …and ${items.length - 5} more`);

  const risk = high > 0 || medium > 0 ? `\n\nRisk: ${high} high · ${medium} medium` : '';

  return `${subject}\n\n${body.join('\n')}${risk}`;
}

/** Long, paste-into-PR-description style with sections. */
export async function draftPrDescription(workspaceRoot: string): Promise<string> {
  const items = await collect(workspaceRoot);
  if (items.length === 0) return '# PR\n\n_No behavior changes vs. branch base._';

  const high = items.filter((i) => i.level === 'high');
  const medium = items.filter((i) => i.level === 'medium');
  const low = items.filter((i) => i.level === 'low' || i.level === 'safe');

  const lines: string[] = [];
  lines.push('## Summary');
  lines.push('');
  lines.push(
    `${items.length} behavior change${items.length === 1 ? '' : 's'} across ${
      new Set(items.map((i) => i.filePath)).size
    } file(s).`,
  );
  lines.push('');
  lines.push('## Risk');
  lines.push('');
  lines.push(`- High: **${high.length}**`);
  lines.push(`- Medium: **${medium.length}**`);
  lines.push(`- Low / Safe: **${low.length}**`);
  lines.push('');
  if (high.length > 0) {
    lines.push('### High-risk changes');
    for (const i of high) {
      lines.push(`- \`${i.fn}\` — ${i.diffTypes.join(', ')}`);
    }
    lines.push('');
  }
  if (medium.length > 0) {
    lines.push('### Medium-risk changes');
    for (const i of medium) lines.push(`- \`${i.fn}\` — ${i.diffTypes.join(', ')}`);
    lines.push('');
  }
  lines.push('## Test plan');
  lines.push('');
  lines.push('- [ ] Existing test suite passes');
  lines.push('- [ ] New tests added for the changes above');
  lines.push('- [ ] Manual smoke-test of high-risk paths');
  return lines.join('\n');
}

function inferVerb(items: ChangeSummary[]): string {
  // Heuristic: pick the verb that best describes the dominant change type.
  const counts: Record<string, number> = {};
  for (const i of items) for (const t of i.diffTypes) counts[t] = (counts[t] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  switch (top) {
    case 'signature':
      return 'refactor:';
    case 'asyncness':
      return 'refactor: async';
    case 'side_effect_surface':
      return 'feat: change side effects in';
    case 'branch_logic':
      return 'fix: branch in';
    case 'return_shape':
      return 'fix: return in';
    case 'throw_set':
      return 'feat: errors in';
    case 'stale_doc':
      return 'docs: update';
    case 'complexity_jump':
      return 'refactor: simplify';
    default:
      return 'chore: update';
  }
}
