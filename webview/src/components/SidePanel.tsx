import { useState } from 'react';
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

export function SidePanel({
  init,
  snapshot,
  onOpenFeedback,
}: {
  init: InitPayload | undefined;
  snapshot: AnalysisSnapshot | undefined;
  onOpenFeedback: () => void;
}) {
  const [filterSev, setFilterSev] = useState<'all' | 'medium' | 'high'>('all');

  if (!init) {
    return <EmptyState title="Loading…" body="Connecting to the extension host." />;
  }

  if (!init.enabled) {
    return (
      <EmptyState
        title="ImpactFlow is disabled"
        body="Enable it in settings → impactflow.enable."
      />
    );
  }

  const rawFiles = snapshot?.files ?? [];
  const files =
    filterSev === 'all'
      ? rawFiles
      : rawFiles
          .map((f) => ({
            ...f,
            modified: f.modified.filter((m) => {
              const order = { safe: 0, low: 1, medium: 2, high: 3 } as const;
              return order[m.topSeverity ?? 'low'] >= order[filterSev];
            }),
          }))
          .filter((f) => f.modified.length + f.added.length + f.removed.length > 0);

  if (rawFiles.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <section className="border-b border-border px-3 py-2 text-[11px] text-muted">
          Since <code className="text-fg">HEAD</code> · no changes
        </section>
        <div className="flex-1">
          <EmptyState
            title="No behavior changes since HEAD"
            body="Edit a TypeScript or JavaScript file in this workspace and ImpactFlow will surface what changed."
            action={
              init.feedback.enable ? { label: 'Send feedback', onClick: onOpenFeedback } : undefined
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <section className="border-b border-border flex items-center justify-between gap-2 px-3 py-2 text-[11px] text-muted">
        <span>
          Since <code className="text-fg">HEAD</code> · {files.length} file
          {files.length === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-1">
          {(['all', 'medium', 'high'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterSev(s)}
              className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                filterSev === s
                  ? 'bg-accent text-accent-fg'
                  : 'hover:bg-[var(--vscode-toolbar-hoverBackground)] text-muted'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>
      <div className="flex-1">
        {files.map((file) => (
          <FileBlock key={file.path} file={file} />
        ))}
      </div>
    </div>
  );
}

function FileBlock({ file }: { file: AnalysisFileSnapshot }) {
  const [open, setOpen] = useState(true);
  const [showPossible, setShowPossible] = useState(false);
  const display = shortenPath(file.path);
  const totals = file.added.length + file.modified.length + file.removed.length;
  const likely = file.modified.filter((m) => (m.tier ?? 'likely') === 'likely');
  const possible = file.modified.filter((m) => m.tier === 'possible');

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-[var(--vscode-list-hoverBackground)] flex w-full items-center justify-between px-3 py-1.5 text-left"
      >
        <span className="truncate text-xs">{display}</span>
        <span className="text-muted ml-2 shrink-0 text-[11px]">
          {open ? '▾' : '▸'} {totals}
        </span>
      </button>
      {open && (
        <div className="pb-1">
          <FnList label="Modified" tone="warn" file={file.path} items={likely} />
          <FnList label="Added" tone="ok" file={file.path} items={file.added} />
          <FnList label="Removed" tone="danger" file={file.path} items={file.removed} />
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
                <FnList label="" tone="warn" file={file.path} items={possible} dim />
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
}: {
  label: string;
  tone: 'warn' | 'ok' | 'danger';
  file: string;
  items: FnSummary[];
  dim?: boolean;
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
          <FnRow key={fn.id} fn={fn} file={file} clickable={tone !== 'danger'} />
        ))}
      </ul>
    </div>
  );
}

function FnRow({
  fn,
  file,
  clickable,
}: {
  fn: FnSummary;
  file: string;
  clickable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasDiffs = (fn.diffs?.length ?? 0) > 0;

  return (
    <li>
      <div
        className={`hover:bg-[var(--vscode-list-hoverBackground)] flex w-full items-center justify-between rounded px-2 py-0.5 text-xs ${
          clickable ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        <button
          type="button"
          onClick={() => {
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
            onClick={() =>
              getVsCode().postMessage({
                type: 'revealFunction',
                payload: { filePath: file, line: fn.line },
              })
            }
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
          <div className="mt-1 flex items-center justify-end">
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
  // Last 2 segments is usually enough context for humans.
  const parts = absPath.split(/[\\/]/);
  return parts.slice(-3).join('/');
}
