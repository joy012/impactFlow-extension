/**
 * Mirror of extension/src/shared/messages.ts.
 * Keep in sync. (Will be replaced by a shared workspace package later.)
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
  tier?: Tier;
  dismissed?: boolean;
  complexity?: number;
  hotspotScore?: number;
  coveragePct?: number;
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

export type ProgressPhase = 'parsing' | 'diffing' | 'references' | 'risk' | 'rendering' | 'idle';

export interface ProgressPayload {
  active: boolean;
  phase: ProgressPhase;
  detail?: string;
  progress?: number;
}

export type HostToWebviewMessage =
  | { type: 'init'; payload: InitPayload }
  | { type: 'showFeedback'; payload: { prefillType: FeedbackType } }
  | { type: 'feedbackResult'; payload: FeedbackResult }
  | { type: 'analysisUpdate'; payload: AnalysisSnapshot }
  | { type: 'progress'; payload: ProgressPayload };

export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'submitFeedback'; payload: FeedbackPayload }
  | { type: 'openExternal'; payload: { url: string } }
  | { type: 'runCommand'; payload: { command: string } }
  | { type: 'revealFunction'; payload: { filePath: string; line: number } }
  | { type: 'dismissFinding'; payload: { fnId: string; reason?: string } }
  | { type: 'copyToClipboard'; payload: { text: string; toast?: string } }
  | { type: 'aiActionForFn'; payload: { fnId: string; action: 'explain' | 'tests' | 'review' } };
