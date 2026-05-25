import { useEffect, useRef, useState } from 'react';
import { EmptyState } from './components/EmptyState.js';
import { FeedbackForm } from './components/FeedbackForm.js';
import { ProgressBar } from './components/ProgressBar.js';
import { SidePanel } from './components/SidePanel.js';
import type {
  AnalysisSnapshot,
  FeedbackResult,
  FeedbackType,
  InitPayload,
  ProgressPayload,
} from './shared/messages.js';
import { getVsCode, onHostMessage } from './vscode.js';

type Tab = 'panel' | 'feedback';

export function App() {
  const [init, setInit] = useState<InitPayload | undefined>();
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | undefined>();
  const [tab, setTab] = useState<Tab>('panel');
  const [feedbackPrefill, setFeedbackPrefill] = useState<FeedbackType>('general');
  const [feedbackResult, setFeedbackResult] = useState<FeedbackResult | undefined>();
  const [progress, setProgress] = useState<ProgressPayload | undefined>();
  const inactiveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const off = onHostMessage((msg) => {
      switch (msg.type) {
        case 'init':
          setInit(msg.payload);
          break;
        case 'showFeedback':
          setFeedbackPrefill(msg.payload.prefillType);
          setTab('feedback');
          setFeedbackResult(undefined);
          break;
        case 'feedbackResult':
          setFeedbackResult(msg.payload);
          break;
        case 'analysisUpdate':
          setSnapshot(msg.payload);
          break;
        case 'progress':
          if (msg.payload.active) {
            if (inactiveTimer.current) {
              window.clearTimeout(inactiveTimer.current);
              inactiveTimer.current = undefined;
            }
            setProgress(msg.payload);
          } else {
            inactiveTimer.current = window.setTimeout(() => {
              setProgress({ active: false, phase: 'idle' });
              inactiveTimer.current = undefined;
            }, 250);
          }
          break;
      }
    });
    getVsCode().postMessage({ type: 'ready' });
    return () => {
      off();
      if (inactiveTimer.current) window.clearTimeout(inactiveTimer.current);
    };
  }, []);

  const fileCount = snapshot?.files.length ?? 0;
  const totalChanges =
    snapshot?.files.reduce(
      (acc, f) => acc + f.added.length + f.modified.length + f.removed.length,
      0,
    ) ?? 0;

  return (
    <div className="flex h-full flex-col bg-bg text-fg">
      <header className="impactflow-header relative flex flex-col gap-2 px-3 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <BrandMark version={init?.extensionVersion} />
          {snapshot && (
            <span className="text-muted shrink-0 text-[10px] tabular-nums">
              {snapshot.durationMs.toFixed(0)}ms
            </span>
          )}
        </div>
        <SegmentedTabs
          value={tab}
          onChange={(v) => {
            setTab(v);
            if (v === 'feedback') setFeedbackResult(undefined);
          }}
          totalChanges={totalChanges}
        />
      </header>

      <ProgressBar progress={progress} />

      <main className="min-h-0 flex-1 overflow-auto">
        {tab === 'panel' ? (
          <SidePanel init={init} snapshot={snapshot} onOpenFeedback={() => setTab('feedback')} />
        ) : (
          <FeedbackForm
            prefillType={feedbackPrefill}
            result={feedbackResult}
            onResultDismiss={() => setFeedbackResult(undefined)}
          />
        )}
      </main>

      <footer className="border-t border-border flex items-center justify-between gap-2 px-3 py-1.5 text-[10px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="impactflow-dot bg-ok inline-block h-1.5 w-1.5 rounded-full" />
          <span>Local · no code leaves your machine</span>
        </span>
        {snapshot && (
          <span className="tabular-nums">
            {fileCount} file{fileCount === 1 ? '' : 's'}
          </span>
        )}
      </footer>
    </div>
  );
}

function BrandMark({ version }: { version: string | undefined }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="impactflow-logo relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="impactflow-logo-ring absolute inset-0 rounded-full" />
        <span className="impactflow-logo-core h-2 w-2 rounded-full" />
      </span>
      <span className="truncate text-[13px] font-semibold tracking-tight">ImpactFlow</span>
      {version && (
        <span className="impactflow-version-pill rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
          v{version}
        </span>
      )}
    </div>
  );
}

function SegmentedTabs({
  value,
  onChange,
  totalChanges,
}: {
  value: Tab;
  onChange: (v: Tab) => void;
  totalChanges: number;
}) {
  return (
    <div
      role="tablist"
      className="impactflow-tabs relative grid grid-cols-2 gap-px rounded-md p-px"
    >
      <SegmentButton active={value === 'panel'} onClick={() => onChange('panel')}>
        <span>Impact</span>
        {totalChanges > 0 && (
          <span
            className={`ml-1 rounded-full px-1.5 py-px text-[9px] font-semibold tabular-nums ${
              value === 'panel'
                ? 'bg-[var(--vscode-button-foreground)]/15 text-[var(--vscode-button-foreground)]'
                : 'bg-[var(--vscode-badge-background,rgba(127,127,127,0.16))] text-fg'
            }`}
          >
            {totalChanges > 99 ? '99+' : totalChanges}
          </span>
        )}
      </SegmentButton>
      <SegmentButton active={value === 'feedback'} onClick={() => onChange('feedback')}>
        Feedback
      </SegmentButton>
    </div>
  );
}

function SegmentButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative flex items-center justify-center gap-1 rounded-[5px] px-2.5 py-1.5 text-[11px] font-medium transition ${
        active
          ? 'bg-accent text-accent-fg shadow-[0_1px_2px_rgba(0,0,0,0.18)]'
          : 'text-muted hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}

export { EmptyState };
