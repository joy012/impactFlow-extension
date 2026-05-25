import { type BehaviorChange, collectChanges } from './change-detection/change-collector.js';

export const draftCommitMessage = async (workspaceRoot: string): Promise<string> => {
  const { changes } = await collectChanges(workspaceRoot);
  if (changes.length === 0) return 'chore: no behavior changes vs. branch base';

  const high = changes.filter((c) => c.risk.level === 'high').length;
  const medium = changes.filter((c) => c.risk.level === 'medium').length;
  const verb = inferVerb(changes);
  const subject =
    changes.length === 1
      ? `${verb} ${changes[0]!.name}`
      : `${verb} ${changes.length} function${changes.length === 1 ? '' : 's'}`;

  const body: string[] = [];
  for (const c of changes.slice(0, 5)) {
    const types = c.diffs
      .map((d) => d.type)
      .slice(0, 3)
      .join(', ');
    body.push(`- ${c.name} (${c.risk.level}): ${types}`);
  }
  if (changes.length > 5) body.push(`- …and ${changes.length - 5} more`);

  const risk = high > 0 || medium > 0 ? `\n\nRisk: ${high} high · ${medium} medium` : '';
  return `${subject}\n\n${body.join('\n')}${risk}`;
};

export const draftPrDescription = async (workspaceRoot: string): Promise<string> => {
  const { changes } = await collectChanges(workspaceRoot);
  if (changes.length === 0) return '# PR\n\n_No behavior changes vs. branch base._';

  const high = changes.filter((c) => c.risk.level === 'high');
  const medium = changes.filter((c) => c.risk.level === 'medium');
  const low = changes.filter((c) => c.risk.level === 'low' || c.risk.level === 'safe');
  const fileCount = new Set(changes.map((c) => c.filePath)).size;

  const lines: string[] = [
    '## Summary',
    '',
    `${changes.length} behavior change${changes.length === 1 ? '' : 's'} across ${fileCount} file(s).`,
    '',
    '## Risk',
    '',
    `- High: **${high.length}**`,
    `- Medium: **${medium.length}**`,
    `- Low / Safe: **${low.length}**`,
    '',
  ];

  if (high.length > 0) {
    lines.push('### High-risk changes');
    for (const c of high) lines.push(`- \`${c.name}\` — ${c.diffs.map((d) => d.type).join(', ')}`);
    lines.push('');
  }
  if (medium.length > 0) {
    lines.push('### Medium-risk changes');
    for (const c of medium)
      lines.push(`- \`${c.name}\` — ${c.diffs.map((d) => d.type).join(', ')}`);
    lines.push('');
  }

  lines.push(
    '## Test plan',
    '',
    '- [ ] Existing test suite passes',
    '- [ ] New tests added for the changes above',
    '- [ ] Manual smoke-test of high-risk paths',
  );
  return lines.join('\n');
};

const inferVerb = (changes: BehaviorChange[]): string => {
  const counts: Record<string, number> = {};
  for (const c of changes) for (const d of c.diffs) counts[d.type] = (counts[d.type] ?? 0) + 1;
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
};
