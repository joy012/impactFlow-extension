import type { ProgressPayload } from '../shared/messages.js';

const PHASE_LABEL: Record<string, string> = {
  parsing: 'Parsing',
  diffing: 'Computing behavior diff',
  references: 'Finding callers',
  risk: 'Scoring risk',
  rendering: 'Rendering',
  idle: '',
};

// Always renders the same fixed height so toggling active never shifts the
// layout below. Idle state just fades the bar + label to 0 opacity.
export function ProgressBar({ progress }: { progress: ProgressPayload | undefined }) {
  const active = Boolean(progress?.active);
  const label = active ? (PHASE_LABEL[progress!.phase] ?? 'Working') : '';
  const determinate = active && typeof progress?.progress === 'number';
  return (
    <div
      className="border-b border-border bg-bg pointer-events-none"
      aria-live="polite"
      data-active={active}
    >
      <div className="relative h-[2px] overflow-hidden bg-[var(--vscode-progressBar-background,var(--vscode-button-background))]">
        {determinate ? (
          <div
            className="absolute inset-y-0 left-0 bg-accent transition-all duration-200"
            style={{
              width: `${Math.round((progress!.progress ?? 0) * 100)}%`,
              opacity: active ? 1 : 0,
            }}
          />
        ) : (
          <div
            className="impactflow-progress-shimmer absolute inset-y-0 w-1/3 bg-accent"
            style={{ opacity: active ? 1 : 0 }}
          />
        )}
      </div>
      <div
        className="flex h-[22px] items-center gap-2 px-3 text-[10.5px] text-muted transition-opacity duration-150"
        style={{ opacity: active ? 1 : 0 }}
      >
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
        <span className="text-fg shrink-0">{label || ' '}</span>
        {progress?.detail && <code className="text-muted truncate">{progress.detail}</code>}
      </div>
    </div>
  );
}
