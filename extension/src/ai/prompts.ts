import type { BehaviorDiffSummary, FnSummary } from '../shared/messages.js';

const SYSTEM_BASE = `You are an expert code reviewer reading a structured behavior-diff
report produced by ImpactFlow. The report tells you WHICH KIND of behavior
change was detected; your job is to explain the implications and what to
verify, not to re-derive the diff. Be concrete and specific. Avoid generic
advice. Markdown allowed but no preamble — start with the answer.`;

const formatDiffs = (diffs: BehaviorDiffSummary[]): string => {
  if (!diffs.length) return '_(no behavior diffs classified)_';
  return diffs.map((d) => `- **${d.type}** (${d.severity}): ${d.description}`).join('\n');
};

const formatCallers = (
  label: string,
  refs: { filePath: string; line: number }[] | undefined,
): string => {
  if (!refs?.length) return '';
  const shorten = (p: string) => p.split(/[\\/]/).slice(-3).join('/');
  const sample = refs.slice(0, 8).map((r) => `- ${shorten(r.filePath)}:${r.line}`);
  const more = refs.length > sample.length ? `\n…and ${refs.length - sample.length} more` : '';
  return `\n**${label}:**\n${sample.join('\n')}${more}`;
};

export const explainChangePrompt = (
  fn: FnSummary,
  filePath: string,
  fnText: string,
): { systemPrompt: string; userPrompt: string } => ({
  systemPrompt: SYSTEM_BASE,
  userPrompt: [
    `## Function: \`${fn.name}\` in \`${filePath.split(/[\\/]/).slice(-2).join('/')}\` (line ${fn.line})`,
    '',
    `**Risk:** ${fn.risk?.level ?? 'unknown'} (score ${fn.risk?.score?.toFixed(1) ?? '–'})`,
    `**Complexity:** ${fn.complexity ?? '–'}`,
    '',
    '### Detected behavior changes',
    formatDiffs(fn.diffs ?? []),
    formatCallers('Affected callers', fn.impacted),
    formatCallers('Tests that exercise this function', fn.impactedTests),
    '',
    '### Current function',
    '```',
    fnText.slice(0, 3000),
    '```',
    '',
    '### What I need from you',
    '1. **Implication** — in 2-3 sentences, what does this change mean for callers?',
    '2. **Verify** — list the 3 most important things to check before merging.',
    '3. **Edge cases** — call out any caller-side edge case that the diff types above might break.',
  ].join('\n'),
});

export const suggestTestsPrompt = (
  fn: FnSummary,
  filePath: string,
  fnText: string,
): { systemPrompt: string; userPrompt: string } => ({
  systemPrompt: `${SYSTEM_BASE}\nFocus on writing test cases, not explanations.`,
  userPrompt: [
    `## Function: \`${fn.name}\` in \`${filePath.split(/[\\/]/).slice(-2).join('/')}\` (line ${fn.line})`,
    '',
    '### Detected behavior changes',
    formatDiffs(fn.diffs ?? []),
    '',
    '### Current function',
    '```',
    fnText.slice(0, 3000),
    '```',
    '',
    '### Output',
    'Write 3-6 concrete test cases (Vitest / Jest / pytest depending on language) that would catch a regression of the diff types above. Each test:',
    '- one-line name',
    '- 3-8 lines of test body',
    'No setup boilerplate, no fixture invention — assume the function is callable directly.',
  ].join('\n'),
});

export const reviewHighRiskPrompt = (
  fn: FnSummary,
  filePath: string,
  fnText: string,
): { systemPrompt: string; userPrompt: string } => ({
  systemPrompt: `${SYSTEM_BASE}\nYou are doing a focused code review on a HIGH-risk change. Be skeptical.`,
  userPrompt: [
    `## HIGH-RISK CHANGE: \`${fn.name}\` (risk ${fn.risk?.score?.toFixed(1) ?? '–'})`,
    '',
    '### Detected behavior changes',
    formatDiffs(fn.diffs ?? []),
    formatCallers('Affected callers', fn.impacted),
    '',
    '### Function',
    '```',
    fnText.slice(0, 3000),
    '```',
    '',
    '### Output (one-pass review)',
    '- **Top concern** — one sentence, the single most likely failure mode.',
    '- **Specific bugs** — bullet list of bugs you can identify *in this function as written*. If you cannot find any, say so explicitly; do not invent.',
    '- **Caller impact** — for each caller above, will this change require a corresponding update? Yes/No + why.',
  ].join('\n'),
});
