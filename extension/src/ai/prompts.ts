import type { AnalysisFileSnapshot, BehaviorDiffSummary, FnSummary } from '../shared/messages.js';

// Token-tight by design: every prompt sends ONLY what the model needs to do its job.
// Function text is trimmed to 1500 chars for single-fn prompts, 0 for snapshot-level prompts.
const SINGLE_FN_TEXT_CAP = 1500;

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
    fnText.slice(0, SINGLE_FN_TEXT_CAP),
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
    fnText.slice(0, SINGLE_FN_TEXT_CAP),
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
    fnText.slice(0, SINGLE_FN_TEXT_CAP),
    '```',
    '',
    '### Output (one-pass review)',
    '- **Top concern** — one sentence, the single most likely failure mode.',
    '- **Specific bugs** — bullet list of bugs you can identify *in this function as written*. If you cannot find any, say so explicitly; do not invent.',
    '- **Caller impact** — for each caller above, will this change require a corresponding update? Yes/No + why.',
  ].join('\n'),
});

// Token-tight: outputs a single doc block, no preamble or explanation around it.
export const updateDocsPrompt = (
  fn: FnSummary,
  filePath: string,
  fnText: string,
): { systemPrompt: string; userPrompt: string } => ({
  systemPrompt:
    'You generate ONLY the documentation block for a function. ' +
    `Match the host language's convention (TS/JS → JSDoc /** */, Python → triple-quoted docstring, ` +
    'Go → // doc comment, Rust → /// doc, Java → /** */, etc.). ' +
    'Do not output the function body. Do not output prose around the block. Just the doc comment.',
  userPrompt: [
    `Function: \`${fn.name}\` in \`${filePath.split(/[\\/]/).slice(-2).join('/')}\``,
    '',
    'Behavior changes since the last doc update:',
    formatDiffs(fn.diffs ?? []),
    '',
    'Current function (for context):',
    '```',
    fnText.slice(0, SINGLE_FN_TEXT_CAP),
    '```',
    '',
    'Output: the new doc comment only. No code, no explanation.',
  ].join('\n'),
});

// Snapshot-level — token-tight: no function bodies, just classified summaries.
export const triageSnapshotPrompt = (
  files: AnalysisFileSnapshot[],
): { systemPrompt: string; userPrompt: string } => {
  const items: string[] = [];
  for (const f of files) {
    for (const m of f.modified) {
      const sev = m.topSeverity ?? '–';
      const types = (m.diffs ?? []).map((d) => d.type).join(',') || '–';
      const callers = m.impacted?.length ?? 0;
      const tests = m.impactedTests?.length ?? 0;
      const risk = m.risk?.score?.toFixed(1) ?? '–';
      items.push(
        `- \`${m.name}\` [${sev}, risk ${risk}] · diffs: ${types} · ${callers} callers · ${tests} tests`,
      );
    }
  }
  return {
    systemPrompt:
      'You triage code reviews. Given a flat list of changed functions and their classified ' +
      'behavior changes (no source code), rank them by review priority. Be specific about WHY.',
    userPrompt: [
      `${items.length} modified function${items.length === 1 ? '' : 's'} in the current snapshot:`,
      '',
      items.join('\n'),
      '',
      'Output, in order of priority:',
      '1. **Review first** — top 3 with one-line rationale each.',
      '2. **Can defer** — functions with low blast radius + small classified change.',
      '3. **One concrete next step** for the reviewer.',
    ].join('\n'),
  };
};

// Token-tight: 2-3 sentences, no source code.
export const whyRiskPrompt = (fn: FnSummary): { systemPrompt: string; userPrompt: string } => ({
  systemPrompt:
    'Explain the risk score for a function in 2-3 plain-English sentences. ' +
    'Use ONLY the classified inputs supplied. Do not invent details.',
  userPrompt: [
    `Function: \`${fn.name}\``,
    `Risk score: ${fn.risk?.score?.toFixed(1) ?? '–'}/${fn.risk?.level ?? '–'}`,
    `Score breakdown: ${(fn.risk?.explanation ?? []).join(' · ')}`,
    `Detected behavior changes: ${(fn.diffs ?? []).map((d) => d.type).join(', ') || 'none'}`,
    `Callers in workspace: ${fn.impacted?.length ?? 0}`,
    `Tests touching it: ${fn.impactedTests?.length ?? 0}`,
    '',
    'In plain English: what does this risk score actually mean for this change?',
  ].join('\n'),
});
