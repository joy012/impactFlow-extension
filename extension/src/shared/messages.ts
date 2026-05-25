/**
 * Message contract between extension host and webview.
 * Mirrored verbatim in webview/src/shared/messages.ts — keep in sync.
 */

export type FeedbackType = 'bug' | 'feature' | 'general';

export interface FeedbackPayload {
  type: FeedbackType;
  title: string;
  description: string;
  reproSteps?: string;
  email?: string;
  attachLogs?: boolean;
  attachEnv?: boolean;
}

export interface FeedbackResult {
  ok: boolean;
  via: 'endpoint' | 'github' | 'failed';
  message: string;
  fallbackUrl?: string;
}

export interface InitPayload {
  extensionVersion: string;
  vscodeVersion: string;
  enabled: boolean;
  isGitRepo: boolean;
  feedback: {
    enable: boolean;
    githubIssuesUrl: string;
  };
}

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

export interface BehaviorDiffSummary {
  type: BehaviorDiffType;
  severity: Severity;
  description: string;
  confidence: number;
}

export interface ImpactedRefSummary {
  filePath: string;
  line: number;
  sameFile: boolean;
}

export interface RiskSummary {
  score: number;
  level: Severity;
  explanation: string[];
}

export type Tier = 'likely' | 'possible';

export interface FnSummary {
  id: string;
  name: string;
  kind: 'function' | 'method' | 'arrow' | 'default-export';
  line: number;
  diffs?: BehaviorDiffSummary[];
  topSeverity?: Severity;
  isExported?: boolean;
  impacted?: ImpactedRefSummary[];
  impactedTests?: ImpactedRefSummary[];
  risk?: RiskSummary;
  /** Filtering tier — `likely` shown by default, `possible` collapsed. */
  tier?: Tier;
  /** True if user has dismissed this finding as not useful. */
  dismissed?: boolean;
  /** Cyclomatic complexity of the current version. */
  complexity?: number;
  /** 0..1 normalized — fraction of the file's git-log activity over the lookup window. */
  hotspotScore?: number;
  /** 0..1 line coverage from lcov.info for this function's line range, when known. */
  coveragePct?: number;
  /** Last commit that touched this function's line range (F6). */
  lastTouched?: { sha: string; author: string; isoDate: string };
}

export interface AnalysisFileSnapshot {
  path: string;
  added: FnSummary[];
  modified: FnSummary[];
  removed: FnSummary[];
}

export interface AnalysisSnapshot {
  files: AnalysisFileSnapshot[];
  generatedAt: number;
  durationMs: number;
}

export type ProgressPhase =
  | 'parsing'
  | 'diffing'
  | 'references'
  | 'risk'
  | 'rendering'
  | 'idle';

export interface ProgressPayload {
  active: boolean;
  phase: ProgressPhase;
  /** Short label shown next to the spinner (e.g. file basename, fn name). */
  detail?: string;
  /** 0..1 if known; undefined for indeterminate work. */
  progress?: number;
}

/* host → webview */
export type HostToWebviewMessage =
  | { type: 'init'; payload: InitPayload }
  | { type: 'showFeedback'; payload: { prefillType: FeedbackType } }
  | { type: 'feedbackResult'; payload: FeedbackResult }
  | { type: 'analysisUpdate'; payload: AnalysisSnapshot }
  | { type: 'progress'; payload: ProgressPayload };

/* webview → host */
export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'submitFeedback'; payload: FeedbackPayload }
  | { type: 'openExternal'; payload: { url: string } }
  | { type: 'runCommand'; payload: { command: string } }
  | { type: 'revealFunction'; payload: { filePath: string; line: number } }
  | { type: 'dismissFinding'; payload: { fnId: string; reason?: string } }
  | { type: 'copyToClipboard'; payload: { text: string; toast?: string } };
