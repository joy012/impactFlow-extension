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
  // Debounce the "active=false" transition so short bursts don't flash.
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
            // Hold the bar for 250ms so user actually sees it on quick passes.
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
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-tight">ImpactFlow</span>
          {init && <span className="text-muted text-[11px]">v{init.extensionVersion}</span>}
        </div>
        <nav className="flex items-center gap-1">
          <TabButton active={tab === 'panel'} onClick={() => setTab('panel')}>
            Impact {totalChanges > 0 && <span className="text-muted">({totalChanges})</span>}
          </TabButton>
          <TabButton
            active={tab === 'feedback'}
            onClick={() => {
              setTab('feedback');
              setFeedbackResult(undefined);
            }}
          >
            Feedback
          </TabButton>
        </nav>
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

      <footer className="border-t border-border px-3 py-1.5 text-[11px] text-muted">
        {snapshot
          ? `Local analysis · ${fileCount} file${fileCount === 1 ? '' : 's'} · ${snapshot.durationMs.toFixed(0)}ms`
          : 'Local analysis · No code leaves your machine'}
      </footer>
    </div>
  );
}

function TabButton({
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
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs transition ${
        active
          ? 'bg-accent text-accent-fg'
          : 'text-muted hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}

export { EmptyState };
