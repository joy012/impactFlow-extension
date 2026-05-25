import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnalysisFileSnapshot,
  AnalysisSnapshot,
  BehaviorDiffSummary,
  FnSummary,
  InitPayload,
  Severity,
} from '../shared/messages.js';
import { getVsCode } from '../vscode.js';
import { EmptyState } from './EmptyState.js';

// Switch to virtualized rendering above this file count.
// Below the threshold the DOM cost is tiny; virtualization would only buy variability.
const VIRTUALIZE_THRESHOLD = 30;

type FilterSeverity = 'all' | 'medium' | 'high';
const SEVERITY_ORDER = { safe: 0, low: 1, medium: 2, high: 3 } as const;

export function SidePanel({
  init,
  snapshot,
  onOpenFeedback,
}: {
  init: InitPayload | undefined;
  snapshot: AnalysisSnapshot | undefined;
  onOpenFeedback: () => void;
}) {
  const [filterSev, setFilterSev] = useState<FilterSeverity>('all');
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  // Stable selection across re-renders — keyed by fn.id so a new snapshot doesn't reset position.
  const [selectedId, setSelectedId] = useState<string | undefined>();

  // Seed collapsed paths from init once available.
  useEffect(() => {
    if (init) setCollapsedPaths(new Set(init.collapsedPaths));
  }, [init]);

  const toggleCollapse = useCallback((filePath: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      const collapsed = !next.has(filePath);
      if (collapsed) next.add(filePath);
      else next.delete(filePath);
      getVsCode().postMessage({
        type: 'setCollapseState',
        payload: { filePath, collapsed },
      });
      return next;
    });
  }, []);

  // All hooks MUST run on every render in the same order — React #310 fires if
  // any hook is called conditionally. Compute derived state before any early
  // return path.
  const rawFiles = snapshot?.files ?? [];
  const files = useMemo(
    () =>
      filterSev === 'all'
        ? rawFiles
        : rawFiles
            .map((f) => ({
              ...f,
              modified: f.modified.filter(
                (m) => SEVERITY_ORDER[m.topSeverity ?? 'low'] >= SEVERITY_ORDER[filterSev],
              ),
            }))
            .filter((f) => f.modified.length + f.added.length + f.removed.length > 0),
    [rawFiles, filterSev],
  );

  // Counts feed the hero card. Computed before any early return so hook order is stable.
  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0, safe: 0 };
    for (const f of rawFiles) {
      for (const m of f.modified) {
        const s = m.topSeverity ?? 'safe';
        c[s]++;
      }
    }
    return c;
  }, [rawFiles]);

  if (!init) {
    return <EmptyState title="Connecting…" body="Waking up the analysis engine." />;
  }

  if (!init.enabled) {
    return (
      <EmptyState
        icon="off"
        title="ImpactFlow is off"
        body="Re-enable in Settings → search “impactflow.enable”."
      />
    );
  }

  if (rawFiles.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <StatsHero counts={{ high: 0, medium: 0, low: 0, safe: 0 }} fileCount={0} />
        <div className="flex-1">
          <EmptyStateNudge init={init} onOpenFeedback={onOpenFeedback} />
        </div>
      </div>
    );
  }

  return (
    <KeyboardNavRoot
      files={files}
      selectedId={selectedId}
      setSelectedId={setSelectedId}
      density={init.density}
    >
      <StatsHero counts={counts} fileCount={files.length}>
        <FilterPills value={filterSev} onChange={setFilterSev} />
      </StatsHero>
      <VirtualizedFileList
        files={files}
        collapsedPaths={collapsedPaths}
        toggleCollapse={toggleCollapse}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
      />
    </KeyboardNavRoot>
  );
}

function StatsHero({
  counts,
  fileCount,
  children,
}: {
  counts: { high: number; medium: number; low: number; safe: number };
  fileCount: number;
  children?: React.ReactNode;
}) {
  const empty = fileCount === 0;
  return (
    <section className="impactflow-hero border-b border-border px-2.5 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-muted flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em]">
          <span className="impactflow-branch-glyph inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          since HEAD
        </span>
        <span className="text-muted text-[10px] tabular-nums">
          {empty ? 'no changes' : `${fileCount} file${fileCount === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <StatChip tone="danger" label="high" value={counts.high} />
        <StatChip tone="warn" label="medium" value={counts.medium} />
        <StatChip tone="ok" label="low" value={counts.low} />
      </div>
      {children && <div className="mt-2">{children}</div>}
    </section>
  );
}

function StatChip({
  tone,
  label,
  value,
}: {
  tone: 'danger' | 'warn' | 'ok';
  label: string;
  value: number;
}) {
  const tint =
    tone === 'danger'
      ? 'impactflow-chip-danger'
      : tone === 'warn'
        ? 'impactflow-chip-warn'
        : 'impactflow-chip-ok';
  return (
    <div className={`impactflow-stat-chip ${tint} rounded-md px-2 py-1.5`}>
      <div className="impactflow-stat-value text-[15px] font-semibold leading-none tabular-nums">
        {value}
      </div>
      <div className="text-muted mt-0.5 text-[9px] uppercase tracking-[0.08em]">{label}</div>
    </div>
  );
}

function FilterPills({
  value,
  onChange,
}: {
  value: FilterSeverity;
  onChange: (v: FilterSeverity) => void;
}) {
  return (
    <div className="impactflow-filter-pills flex items-center gap-px rounded-md p-px">
      {(['all', 'medium', 'high'] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`flex-1 rounded-[5px] px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition ${
            value === s
              ? 'bg-accent text-accent-fg'
              : 'text-muted hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:text-fg'
          }`}
        >
          {s === 'all' ? 'All' : s === 'medium' ? '≥ Med' : 'High'}
        </button>
      ))}
    </div>
  );
}

// Wraps the side panel content with keyboard navigation (j/k/enter/x/?).
// Maintains a flat list of all visible fn ids so j/k can move through them in order.
function KeyboardNavRoot({
  files,
  selectedId,
  setSelectedId,
  density,
  children,
}: {
  files: AnalysisFileSnapshot[];
  selectedId: string | undefined;
  setSelectedId: (id: string | undefined) => void;
  density: 'compact' | 'comfortable';
  children: React.ReactNode;
}) {
  const flat = useMemo(() => {
    const out: { id: string; filePath: string; line: number }[] = [];
    for (const f of files) {
      for (const m of f.modified) out.push({ id: m.id, filePath: f.path, line: m.line });
      for (const a of f.added) out.push({ id: a.id, filePath: f.path, line: a.line });
    }
    return out;
  }, [files]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack keys when typing in inputs.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (flat.length === 0) return;

      const currentIdx = selectedId ? flat.findIndex((it) => it.id === selectedId) : -1;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedId(flat[Math.min(flat.length - 1, currentIdx + 1)]?.id);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedId(flat[Math.max(0, currentIdx - 1)]?.id);
      } else if (e.key === 'Enter' && currentIdx >= 0) {
        const cur = flat[currentIdx];
        if (cur) {
          getVsCode().postMessage({
            type: 'revealFunction',
            payload: { filePath: cur.filePath, line: cur.line },
          });
        }
      } else if (e.key === 'x' && currentIdx >= 0) {
        const cur = flat[currentIdx];
        if (cur) {
          getVsCode().postMessage({
            type: 'dismissFinding',
            payload: { fnId: cur.id, reason: 'not-useful' },
          });
        }
      } else if (e.key === '?') {
        alert(
          'ImpactFlow shortcuts:\n  j / ↓  next function\n  k / ↑  previous function\n  Enter  open at line\n  x      dismiss\n  ?      this help',
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flat, selectedId, setSelectedId]);

  return (
    <div
      className="flex h-full flex-col outline-none"
      data-density={density}
      // Make the panel focusable so global keystrokes work even before the user clicks.
      tabIndex={-1}
    >
      {children}
    </div>
  );
}

function EmptyStateNudge({
  init,
  onOpenFeedback: _onOpenFeedback,
}: {
  init: InitPayload;
  onOpenFeedback: () => void;
}) {
  if (!init.isGitRepo) {
    return (
      <EmptyState
        icon="spark"
        title="No git repo here"
        body="Run `git init` in this folder, then ImpactFlow can show what changed against HEAD."
      />
    );
  }
  return (
    <EmptyState
      icon="ripple"
      title="Nothing to flag yet"
      body="Edit a function to see live impact, or compare any two branches for a full behavior diff."
      action={{
        label: 'Compare branches',
        onClick: () =>
          getVsCode().postMessage({
            type: 'runCommand',
            payload: { command: 'impactflow.compareBranches' },
          }),
      }}
    />
  );
}

function VirtualizedFileList({
  files,
  collapsedPaths,
  toggleCollapse,
  selectedId,
  setSelectedId,
}: {
  files: AnalysisFileSnapshot[];
  collapsedPaths: Set<string>;
  toggleCollapse: (filePath: string) => void;
  selectedId: string | undefined;
  setSelectedId: (id: string | undefined) => void;
}) {
  // Hooks must run unconditionally (React #310). The small-list branch returns
  // below this block; until then both useRef and useVirtualizer always run.
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (collapsedPaths.has(files[i]!.path) ? 32 : 140),
    overscan: 6,
    getItemKey: (i) => files[i]!.path,
  });

  // Small lists render directly — react-virtual's ResizeObserver isn't worth
  // setting up below the threshold. The hooks above are still cheap when unused.
  if (files.length < VIRTUALIZE_THRESHOLD) {
    return (
      <div className="flex-1 overflow-auto">
        {files.map((file) => (
          <FileBlock
            key={file.path}
            file={file}
            collapsed={collapsedPaths.has(file.path)}
            onToggle={() => toggleCollapse(file.path)}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
          />
        ))}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const file = files[vi.index]!;
          return (
            <div
              key={file.path}
              ref={virtualizer.measureElement}
              data-index={vi.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <FileBlock
                file={file}
                collapsed={collapsedPaths.has(file.path)}
                onToggle={() => toggleCollapse(file.path)}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FileBlock({
  file,
  collapsed,
  onToggle,
  selectedId,
  setSelectedId,
}: {
  file: AnalysisFileSnapshot;
  collapsed: boolean;
  onToggle: () => void;
  selectedId: string | undefined;
  setSelectedId: (id: string | undefined) => void;
}) {
  const [showPossible, setShowPossible] = useState(false);
  const display = shortenPath(file.path);
  const totals = file.added.length + file.modified.length + file.removed.length;
  const likely = file.modified.filter((m) => (m.tier ?? 'likely') === 'likely');
  const possible = file.modified.filter((m) => m.tier === 'possible');
  const open = !collapsed;

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={onToggle}
        className="hover:bg-[var(--vscode-list-hoverBackground)] flex w-full items-center justify-between px-3 py-1.5 text-left"
      >
        <span className="truncate text-xs">{display}</span>
        <span className="text-muted ml-2 shrink-0 text-[11px]">
          {open ? '▾' : '▸'} {totals}
        </span>
      </button>
      {open && (
        <div className="pb-1">
          <FnList
            label="Modified"
            tone="warn"
            file={file.path}
            items={likely}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
          />
          <FnList
            label="Added"
            tone="ok"
            file={file.path}
            items={file.added}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
          />
          <FnList
            label="Removed"
            tone="danger"
            file={file.path}
            items={file.removed}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
          />
          {possible.length > 0 && (
            <div className="px-3 pt-1">
              <button
                type="button"
                onClick={() => setShowPossible((v) => !v)}
                className="text-muted hover:text-fg text-[11px]"
              >
                {showPossible ? '▾' : '▸'} {possible.length} possible (lower confidence)
              </button>
              {showPossible && (
                <FnList
                  label=""
                  tone="warn"
                  file={file.path}
                  items={possible}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  dim
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FnList({
  label,
  tone,
  file,
  items,
  dim,
  selectedId,
  setSelectedId,
}: {
  label: string;
  tone: 'warn' | 'ok' | 'danger';
  file: string;
  items: FnSummary[];
  dim?: boolean;
  selectedId: string | undefined;
  setSelectedId: (id: string | undefined) => void;
}) {
  if (items.length === 0) return null;
  const toneClass = tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-danger';
  return (
    <div className={`px-3 py-1 ${dim ? 'opacity-70' : ''}`}>
      {label && (
        <div className={`text-[10px] uppercase tracking-wider ${toneClass}`}>
          {label} ({items.length})
        </div>
      )}
      <ul>
        {items.map((fn) => (
          <FnRow
            key={fn.id}
            fn={fn}
            file={file}
            clickable={tone !== 'danger'}
            selected={selectedId === fn.id}
            onSelect={() => setSelectedId(fn.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function FnRow({
  fn,
  file,
  clickable,
  selected,
  onSelect,
}: {
  fn: FnSummary;
  file: string;
  clickable: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasDiffs = (fn.diffs?.length ?? 0) > 0;
  const rowRef = useRef<HTMLLIElement | null>(null);

  // Scroll the selected row into view when keyboard nav moves the cursor.
  useEffect(() => {
    if (selected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selected]);

  return (
    <li ref={rowRef}>
      <div
        className={`hover:bg-[var(--vscode-list-hoverBackground)] flex w-full items-center justify-between rounded px-2 text-xs ${
          clickable ? 'cursor-pointer' : 'cursor-default'
        } ${selected ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]' : ''} impactflow-row`}
      >
        <button
          type="button"
          onClick={() => {
            onSelect();
            if (hasDiffs) setOpen((v) => !v);
            else if (clickable) {
              getVsCode().postMessage({
                type: 'revealFunction',
                payload: { filePath: file, line: fn.line },
              });
            }
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {hasDiffs && <span className="text-muted text-[10px]">{open ? '▾' : '▸'}</span>}
          <span className="text-muted">{kindIcon(fn.kind)}</span>
          <span className="truncate">{fn.name}</span>
          {fn.topSeverity && fn.topSeverity !== 'safe' && <SeverityBadge sev={fn.topSeverity} />}
          {fn.complexity != null && fn.complexity > 10 && (
            <span
              className="text-warn rounded bg-[var(--vscode-toolbar-hoverBackground)] px-1 py-px text-[9px]"
              title={`Cyclomatic complexity: ${fn.complexity}`}
            >
              cc{fn.complexity}
            </span>
          )}
          {fn.hotspotScore != null && fn.hotspotScore >= 0.6 && (
            <span
              className="text-danger text-[10px]"
              title={`File hotness (last 90d): ${Math.round(fn.hotspotScore * 100)}%`}
            >
              🔥
            </span>
          )}
          {fn.coveragePct != null && fn.coveragePct < 0.5 && (
            <span
              className="text-warn rounded bg-[var(--vscode-toolbar-hoverBackground)] px-1 py-px text-[9px]"
              title={`Line coverage: ${Math.round(fn.coveragePct * 100)}%`}
            >
              cov {Math.round(fn.coveragePct * 100)}%
            </span>
          )}
          {fn.lastTouched && (
            <span
              className="text-muted text-[9px]"
              title={`Last touched: ${fn.lastTouched.sha} by ${fn.lastTouched.author} on ${fn.lastTouched.isoDate.slice(0, 10)}`}
            >
              @{initialsOf(fn.lastTouched.author)}
            </span>
          )}
        </button>
        {clickable && (
          <button
            type="button"
            onClick={() => {
              onSelect();
              getVsCode().postMessage({
                type: 'revealFunction',
                payload: { filePath: file, line: fn.line },
              });
            }}
            className="text-muted ml-2 shrink-0 text-[11px] hover:underline"
            title="Go to source"
          >
            L{fn.line}
          </button>
        )}
      </div>
      {open && hasDiffs && (
        <div className="border-border ml-4 border-l py-1 pl-2">
          <ul>
            {fn.diffs!.map((d, i) => (
              <DiffLine key={i} d={d} />
            ))}
          </ul>
          {fn.impactedTests && fn.impactedTests.length > 0 && (
            <div className="mt-1">
              <div className="text-ok text-[10px] uppercase tracking-wider">
                Tests to re-run ({fn.impactedTests.length})
              </div>
              <ul className="mt-0.5">
                {fn.impactedTests.slice(0, 8).map((r, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() =>
                        getVsCode().postMessage({
                          type: 'revealFunction',
                          payload: { filePath: r.filePath, line: r.line },
                        })
                      }
                      className="hover:bg-[var(--vscode-list-hoverBackground)] block w-full truncate rounded px-1 py-0.5 text-left text-[11px]"
                    >
                      {shortenPathStatic(r.filePath)}
                      <span className="text-muted ml-1">L{r.line}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fn.impacted && fn.impacted.length > 0 && (
            <div className="mt-1">
              <div className="text-muted text-[10px] uppercase tracking-wider">
                Impacted callers ({fn.impacted.length})
              </div>
              <ul className="mt-0.5">
                {fn.impacted.slice(0, 8).map((r, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() =>
                        getVsCode().postMessage({
                          type: 'revealFunction',
                          payload: { filePath: r.filePath, line: r.line },
                        })
                      }
                      className="hover:bg-[var(--vscode-list-hoverBackground)] block w-full truncate rounded px-1 py-0.5 text-left text-[11px]"
                    >
                      <span className="text-muted">{r.sameFile ? '↺ ' : ''}</span>
                      {shortenPathStatic(r.filePath)}
                      <span className="text-muted ml-1">L{r.line}</span>
                    </button>
                  </li>
                ))}
                {fn.impacted.length > 8 && (
                  <li className="text-muted px-1 text-[11px]">+ {fn.impacted.length - 8} more…</li>
                )}
              </ul>
            </div>
          )}
          {fn.risk && fn.risk.explanation.length > 0 && (
            <div className="text-muted mt-1 text-[10px]">
              <span className="text-fg">risk {fn.risk.score.toFixed(1)}</span>:{' '}
              {fn.risk.explanation.join(' · ')}
            </div>
          )}
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px]">
              <button
                type="button"
                onClick={() =>
                  getVsCode().postMessage({
                    type: 'aiActionForFn',
                    payload: { fnId: fn.id, action: 'explain' },
                  })
                }
                className="text-link hover:underline"
                title="AI: Explain this change (BYOK · opt-in)"
              >
                🔍 explain
              </button>
              <button
                type="button"
                onClick={() =>
                  getVsCode().postMessage({
                    type: 'aiActionForFn',
                    payload: { fnId: fn.id, action: 'tests' },
                  })
                }
                className="text-link hover:underline"
                title="AI: Suggest tests for this change"
              >
                🧪 tests
              </button>
              {fn.topSeverity === 'high' && (
                <button
                  type="button"
                  onClick={() =>
                    getVsCode().postMessage({
                      type: 'aiActionForFn',
                      payload: { fnId: fn.id, action: 'review' },
                    })
                  }
                  className="text-link hover:underline"
                  title="AI: Focused review of this high-risk change"
                >
                  🚨 review
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() =>
                getVsCode().postMessage({
                  type: 'dismissFinding',
                  payload: { fnId: fn.id, reason: 'not-useful' },
                })
              }
              className="text-muted hover:text-fg text-[10px]"
              title="Mark this finding as not useful"
            >
              👎 not useful
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function shortenPathStatic(absPath: string): string {
  const parts = absPath.split(/[\\/]/);
  return parts.slice(-2).join('/');
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);
}

function DiffLine({ d }: { d: BehaviorDiffSummary }) {
  return (
    <li className="py-0.5 text-[11px]">
      <span className="text-muted mr-1">{labelForDiff(d.type)}</span>
      <span>{d.description}</span>
      {d.confidence < 0.7 && (
        <span className="text-muted ml-1">({Math.round(d.confidence * 100)}%)</span>
      )}
    </li>
  );
}

function SeverityBadge({ sev }: { sev: Severity }) {
  const cls =
    sev === 'high'
      ? 'bg-danger/15 text-danger'
      : sev === 'medium'
        ? 'bg-warn/15 text-warn'
        : 'bg-ok/15 text-ok';
  return (
    <span className={`rounded px-1 py-px text-[9px] uppercase tracking-wider ${cls}`}>{sev}</span>
  );
}

function labelForDiff(t: BehaviorDiffSummary['type']): string {
  switch (t) {
    case 'signature':
      return 'signature';
    case 'branch_logic':
      return 'branch';
    case 'return_shape':
      return 'return';
    case 'call_set':
      return 'calls';
    case 'throw_set':
      return 'throws';
    case 'asyncness':
      return 'async';
    case 'side_effect_surface':
      return 'effects';
    case 'stale_doc':
      return 'stale-doc';
    case 'complexity_jump':
      return 'complexity';
  }
}

function kindIcon(k: FnSummary['kind']): string {
  switch (k) {
    case 'function':
      return 'ƒ';
    case 'method':
      return 'm';
    case 'arrow':
      return '⇒';
    case 'default-export':
      return '★';
  }
}

function shortenPath(absPath: string): string {
  const parts = absPath.split(/[\\/]/);
  return parts.slice(-3).join('/');
}
