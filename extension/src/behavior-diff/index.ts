import { extractFactsRouted } from '../parsers/router.js';
import type { FnEntry } from '../parsers/typescript/function-table.js';
import type { FnFacts } from './facts.js';

export type BehaviorDiffType =
  | 'signature'
  | 'branch_logic'
  | 'return_shape'
  | 'call_set'
  | 'throw_set'
  | 'asyncness'
  | 'side_effect_surface'
  | 'stale_doc'
  | 'complexity_jump';

export type Severity = 'safe' | 'low' | 'medium' | 'high';

export interface BehaviorDiff {
  type: BehaviorDiffType;
  severity: Severity;
  description: string;
  confidence: number;
}

export interface BehaviorDiffResult {
  diffs: BehaviorDiff[];
  /** True if the bodies are identical modulo identifier renames + formatting. */
  pureRenameOrFormatting: boolean;
}

type Detector = (before: FnFacts, after: FnFacts) => BehaviorDiff[];

export const diffBehavior = (before: FnEntry, after: FnEntry): BehaviorDiffResult => {
  const bFacts = extractFactsRouted(before);
  const aFacts = extractFactsRouted(after);

  const skeletonsMatch = bFacts.skeleton === aFacts.skeleton;
  const metadataUnchanged =
    bFacts.paramSig === aFacts.paramSig &&
    bFacts.returnType === aFacts.returnType &&
    bFacts.isAsync === aFacts.isAsync &&
    bFacts.isGenerator === aFacts.isGenerator;
  if (skeletonsMatch && metadataUnchanged) {
    return { diffs: [], pureRenameOrFormatting: true };
  }

  const diffs: BehaviorDiff[] = [];
  for (const d of DETECTORS) diffs.push(...d(bFacts, aFacts));

  if (
    before.leadingDocHash &&
    before.leadingDocHash === after.leadingDocHash &&
    before.bodyHash !== after.bodyHash &&
    diffs.length > 0
  ) {
    diffs.push({
      type: 'stale_doc',
      severity: 'low',
      description: 'Function body changed but its doc-comment was not updated.',
      confidence: 0.8,
    });
  }

  if (aFacts.complexity - bFacts.complexity >= 3) {
    diffs.push({
      type: 'complexity_jump',
      severity: 'medium',
      description: `Cyclomatic complexity rose ${bFacts.complexity} → ${aFacts.complexity} (+${aFacts.complexity - bFacts.complexity}).`,
      confidence: 0.9,
    });
  }

  return { diffs, pureRenameOrFormatting: false };
};

const detectSignature: Detector = (b, a) => {
  if (b.paramSig === a.paramSig && b.returnType === a.returnType) return [];
  const parts: string[] = [];
  if (b.paramSig !== a.paramSig)
    parts.push(`parameters changed (${b.paramSig || '∅'} → ${a.paramSig || '∅'})`);
  if (b.returnType !== a.returnType)
    parts.push(`return type changed (${b.returnType ?? '?'} → ${a.returnType ?? '?'})`);
  return [{ type: 'signature', severity: 'high', description: parts.join('; '), confidence: 0.95 }];
};

const detectBranchLogic: Detector = (b, a) => {
  if (sameSet(b.branchConditions, a.branchConditions)) return [];
  const { added, removed } = diffSets(b.branchConditions, a.branchConditions);
  if (added.length === 0 && removed.length === 0) return [];
  return [
    {
      type: 'branch_logic',
      severity: 'medium',
      description: describeAddRemove('branch conditions', added, removed),
      confidence: 0.75,
    },
  ];
};

const detectReturnShape: Detector = (b, a) => {
  if (sameSet(b.returnExprs, a.returnExprs)) return [];
  const { added, removed } = diffSets(b.returnExprs, a.returnExprs);
  if (added.length === 0 && removed.length === 0) return [];
  // Count change = control-flow shift → high severity.
  const severity: Severity = b.returnExprs.length !== a.returnExprs.length ? 'high' : 'medium';
  return [
    {
      type: 'return_shape',
      severity,
      description: describeAddRemove('return values', added, removed),
      confidence: 0.85,
    },
  ];
};

const detectCallSet: Detector = (b, a) => {
  if (sameSet(b.callSites, a.callSites)) return [];
  const { added, removed } = diffSets(b.callSites, a.callSites);
  if (added.length === 0 && removed.length === 0) return [];
  return [
    {
      type: 'call_set',
      severity: 'medium',
      description: describeAddRemove('calls', added, removed),
      confidence: 0.8,
    },
  ];
};

const detectThrowSet: Detector = (b, a) => {
  if (sameSet(b.throws, a.throws)) return [];
  const { added, removed } = diffSets(b.throws, a.throws);
  if (added.length === 0 && removed.length === 0) return [];
  return [
    {
      type: 'throw_set',
      severity: 'medium',
      description: describeAddRemove('throws', added, removed),
      confidence: 0.85,
    },
  ];
};

const detectAsyncness: Detector = (b, a) => {
  if (b.isAsync === a.isAsync && b.isGenerator === a.isGenerator) return [];
  const parts: string[] = [];
  if (b.isAsync !== a.isAsync) parts.push(a.isAsync ? 'became async' : 'no longer async');
  if (b.isGenerator !== a.isGenerator)
    parts.push(a.isGenerator ? 'became generator' : 'no longer generator');
  return [{ type: 'asyncness', severity: 'high', description: parts.join('; '), confidence: 0.95 }];
};

const detectSideEffect: Detector = (b, a) => {
  if (setEqual(b.effects, a.effects)) return [];
  const added = [...a.effects].filter((x) => !b.effects.has(x));
  const removed = [...b.effects].filter((x) => !a.effects.has(x));
  return [
    {
      type: 'side_effect_surface',
      severity: 'medium',
      description: describeAddRemove('side-effect patterns', added, removed),
      confidence: 0.6,
    },
  ];
};

const DETECTORS: Detector[] = [
  detectSignature,
  detectAsyncness,
  detectReturnShape,
  detectBranchLogic,
  detectCallSet,
  detectThrowSet,
  detectSideEffect,
];

const sameSet = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

const setEqual = <T>(a: Set<T>, b: Set<T>): boolean => {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
};

const diffSets = (before: string[], after: string[]): { added: string[]; removed: string[] } => {
  const bSet = new Set(before);
  const aSet = new Set(after);
  return {
    added: [...aSet].filter((x) => !bSet.has(x)),
    removed: [...bSet].filter((x) => !aSet.has(x)),
  };
};

const describeAddRemove = (label: string, added: string[], removed: string[]): string => {
  const parts: string[] = [];
  if (added.length)
    parts.push(`+${label}: ${added.slice(0, 4).join(', ')}${added.length > 4 ? '…' : ''}`);
  if (removed.length)
    parts.push(`-${label}: ${removed.slice(0, 4).join(', ')}${removed.length > 4 ? '…' : ''}`);
  return parts.join(' / ');
};

export const severityWeight = (s: Severity): number => {
  switch (s) {
    case 'safe':
      return 0;
    case 'low':
      return 1;
    case 'medium':
      return 2;
    case 'high':
      return 4;
  }
};
