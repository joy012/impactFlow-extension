import type { ProgressPayload } from '../shared/messages.js';

const PHASE_LABEL: Record<string, string> = {
  parsing: 'Parsing',
  diffing: 'Computing behavior diff',
  references: 'Finding callers',
  risk: 'Scoring risk',
  rendering: 'Rendering',
  idle: '',
};

export function ProgressBar({ progress }: { progress: ProgressPayload | undefined }) {
  if (!progress || !progress.active) {
    return <div className="h-[2px] bg-transparent" aria-hidden="true" />;
  }
  const label = PHASE_LABEL[progress.phase] ?? 'Working';
  const determinate = typeof progress.progress === 'number';
  return (
    <div className="border-b border-border bg-bg" aria-live="polite">
      <div className="relative h-[2px] overflow-hidden bg-[var(--vscode-progressBar-background,var(--vscode-button-background))]">
        {determinate ? (
          <div
            className="absolute inset-y-0 left-0 bg-accent transition-all duration-200"
            style={{ width: `${Math.round((progress.progress ?? 0) * 100)}%` }}
          />
        ) : (
          <div className="impactflow-progress-shimmer absolute inset-y-0 w-1/3 bg-accent" />
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-1 text-[10.5px] text-muted">
        <span className="impactflow-progress-pulse inline-block h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="text-fg">{label}</span>
        {progress.detail && <code className="truncate text-muted">{progress.detail}</code>}
      </div>
    </div>
  );
}
