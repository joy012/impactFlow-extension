/**
 * Phase 1 pipeline: change → baseline → parse → function-table-diff → snapshot.
 * Phase 2+ extends this with behavior diff / impact / risk.
 */

import { performance } from 'node:perf_hooks';
import * as vscode from 'vscode';
import { type Severity, diffBehavior } from './behavior-diff/index.js';
import type { Baseline } from './change-detection/baseline.js';
import type { ChangeNotification } from './change-detection/watcher.js';
import type { CoverageEngine } from './coverage/lcov.js';
import { passesSeverityThreshold, pickTier } from './filters.js';
import type { LastTouchedEngine } from './git-blame/last-touched.js';
import type { HotspotEngine } from './hotspot/index.js';
import { findReferences } from './impact/references.js';
import { logger } from './logger.js';
import { buildFunctionTable, languageFor } from './parsers/router.js';
import { diffFunctionTables, emptyTable } from './parsers/typescript/diff-functions.js';
import type { FnEntry } from './parsers/typescript/function-table.js';
import { computeRisk } from './risk/formula.js';
import type { AnalysisFileSnapshot, AnalysisSnapshot, FnSummary } from './shared/messages.js';
import type { FeedbackStore } from './storage/feedback-store.js';

export type SnapshotListener = (snap: AnalysisSnapshot) => void;

/** LRU-ish cap so a long session doesn't grow snapshot state unbounded. */
const MAX_FILE_SNAPSHOTS = 200;

export class Pipeline {
  private fileSnapshots = new Map<string, AnalysisFileSnapshot>();
  private listeners = new Set<SnapshotListener>();
  private perfSamples: Array<{ filePath: string; durationMs: number; at: number }> = [];
  private readonly perfMax = 50;

  constructor(
    private readonly baseline: Baseline,
    private readonly feedback?: FeedbackStore,
    private readonly hotspot?: HotspotEngine,
    private readonly coverage?: CoverageEngine,
    private readonly lastTouched?: LastTouchedEngine,
  ) {}

  async refreshCoverage(): Promise<boolean> {
    if (!this.coverage) return false;
    await this.coverage.reload();
    await this.analyzeOpenDocuments();
    return this.coverage.isActive();
  }

  onSnapshot(listener: SnapshotListener): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  /** Re-analyze all open files (used on startup + manual reset). */
  async analyzeOpenDocuments(): Promise<void> {
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.uri.scheme !== 'file') continue;
      if (languageFor(doc.uri.fsPath)) {
        await this.analyzeOne(doc.uri.fsPath);
      }
    }
    this.emit();
  }

  async handleChange(n: ChangeNotification): Promise<void> {
    await this.analyzeOne(n.filePath);
    this.emit();
  }

  perfStats(): { samples: number; p50: number; p95: number; last: number | null } {
    if (this.perfSamples.length === 0) return { samples: 0, p50: 0, p95: 0, last: null };
    const sorted = [...this.perfSamples].sort((a, b) => a.durationMs - b.durationMs);
    const p = (q: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!.durationMs;
    return {
      samples: sorted.length,
      p50: p(0.5),
      p95: p(0.95),
      last: this.perfSamples[this.perfSamples.length - 1]!.durationMs,
    };
  }

  /** Drop all baselines and re-analyze. */
  async reset(): Promise<void> {
    this.fileSnapshots.clear();
    await this.analyzeOpenDocuments();
  }

  private async analyzeOne(filePath: string): Promise<void> {
    const t0 = performance.now();
    try {
      // G9 — respect the exclude glob configured by the user.
      if (isExcluded(filePath)) {
        this.fileSnapshots.delete(filePath);
        return;
      }
      const currentText = await loadCurrentText(filePath);
      if (currentText === null) {
        this.fileSnapshots.delete(filePath);
        return;
      }
      // G1 — file-size cap so the extension host can't OOM on huge generated files.
      const maxKb = vscode.workspace
        .getConfiguration('impactflow')
        .get<number>('maxFileSizeKb', 512);
      if (currentText.length > maxKb * 1024) {
        logger.debug(`skipping ${filePath}: ${currentText.length} bytes > ${maxKb} KB cap`);
        this.fileSnapshots.delete(filePath);
        return;
      }
      const baselineText = await this.baseline.getFile(filePath);

      const beforeTable = baselineText
        ? buildFunctionTable(filePath, baselineText)
        : emptyTable(filePath);
      const afterTable = buildFunctionTable(filePath, currentText);
      const diff = diffFunctionTables(beforeTable, afterTable);

      // Run behavior-diff for each modified function; drop pure renames / formatting.
      // For surviving modifications, compute impact + risk in parallel.
      const modifiedTasks = diff.modified
        .map(({ before, after: afterFn }) => {
          const bd = diffBehavior(before, afterFn);
          if (bd.pureRenameOrFormatting || bd.diffs.length === 0) return null;
          return { before, afterFn, bd };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const severityShow = vscode.workspace
        .getConfiguration('impactflow.severity')
        .get<string>('show', 'medium');

      // Fire-and-forget hotspot refresh; uses cache on subsequent passes.
      void this.hotspot?.refresh(filePath);

      const allModified: FnSummary[] = await Promise.all(
        modifiedTasks.map(async ({ afterFn, bd }) => {
          const allRefs = await findReferences(filePath, afterFn.name, afterFn.startLine);
          const impactedTests = allRefs.filter((r) => isTestPath(r.filePath));
          const impacted = allRefs.filter((r) => !isTestPath(r.filePath));
          const top = topSeverity(bd.diffs.map((d) => d.severity));
          const touchesAsync = bd.diffs.some((d) => d.type === 'asyncness');
          const crossesPkg = impacted.some((r) => !samePackage(r.filePath, filePath));
          const risk = computeRisk({
            topSeverity: top,
            isPublicSurface: afterFn.isExported,
            impactedCount: impacted.length,
            crossesPackageBoundary: crossesPkg,
            touchesAsyncBoundary: touchesAsync,
          });
          const tier = pickTier({
            fn: afterFn,
            diffs: bd.diffs,
            topSeverity: top,
            impactedCount: impacted.length,
          });
          const coveragePct =
            this.coverage?.forFunction(filePath, afterFn.startLine, afterFn.endLine) ?? null;
          const lastTouched = await this.lastTouched?.lookup(
            filePath,
            afterFn.startLine,
            afterFn.endLine,
          );
          return {
            ...summarize(afterFn),
            isExported: afterFn.isExported,
            diffs: bd.diffs.map((d) => ({
              type: d.type,
              severity: d.severity,
              description: d.description,
              confidence: d.confidence,
            })),
            topSeverity: top,
            impacted,
            impactedTests,
            risk,
            tier,
            dismissed: this.feedback?.isDismissed(afterFn.id) ?? false,
            complexity: countComplexity(afterFn.fullText),
            hotspotScore: this.hotspot?.score(filePath),
            coveragePct: coveragePct ?? undefined,
            lastTouched: lastTouched ?? undefined,
          };
        }),
      );

      // Apply severity threshold + drop dismissed.
      const modified = allModified.filter((m) => {
        if (m.dismissed) return false;
        if (!m.topSeverity) return true;
        return passesSeverityThreshold(m.topSeverity, severityShow);
      });

      const snap: AnalysisFileSnapshot = {
        path: filePath,
        added: diff.added.map(summarize),
        modified,
        removed: diff.removed.map(summarize),
      };

      if (snap.added.length === 0 && snap.modified.length === 0 && snap.removed.length === 0) {
        this.fileSnapshots.delete(filePath);
      } else {
        // Move-to-end for LRU semantics: re-insertion bumps to the tail.
        this.fileSnapshots.delete(filePath);
        this.fileSnapshots.set(filePath, snap);
        if (this.fileSnapshots.size > MAX_FILE_SNAPSHOTS) {
          const oldest = this.fileSnapshots.keys().next().value;
          if (oldest) this.fileSnapshots.delete(oldest);
        }
      }
    } catch (err) {
      logger.error(`Pipeline error for ${filePath}`, err);
    } finally {
      const dt = performance.now() - t0;
      this.perfSamples.push({ filePath, durationMs: dt, at: Date.now() });
      if (this.perfSamples.length > this.perfMax) this.perfSamples.shift();
    }
  }

  private emit(): void {
    const snap: AnalysisSnapshot = {
      files: [...this.fileSnapshots.values()].sort((a, b) => a.path.localeCompare(b.path)),
      generatedAt: Date.now(),
      durationMs: this.perfSamples[this.perfSamples.length - 1]?.durationMs ?? 0,
    };
    for (const l of this.listeners) {
      try {
        l(snap);
      } catch (err) {
        logger.error('Snapshot listener threw', err);
      }
    }
  }
}

function summarize(fn: FnEntry): FnSummary {
  return { id: fn.id, name: fn.name, kind: fn.kind, line: fn.startLine };
}

function topSeverity(severities: Severity[]): Severity {
  const order: Severity[] = ['high', 'medium', 'low', 'safe'];
  for (const s of order) if (severities.includes(s)) return s;
  return 'safe';
}

/** True if filePath matches any of the user's configured exclude globs. */
function isExcluded(filePath: string): boolean {
  const cfg = vscode.workspace.getConfiguration('impactflow');
  const excludes = cfg.get<string[]>('exclude', []) ?? [];
  if (excludes.length === 0) return false;
  // Minimal `**` + `*` glob match; sufficient for the standard defaults.
  const norm = filePath.replaceAll('\\', '/');
  return excludes.some((pattern) => {
    const re = new RegExp(
      `^${pattern
        .replaceAll('.', '\\.')
        .replaceAll('**/', '(?:.*/)?')
        .replaceAll('**', '.*')
        .replaceAll('*', '[^/]*')}$`,
    );
    return re.test(norm);
  });
}

/** Match common test-path conventions across ecosystems. */
function isTestPath(p: string): boolean {
  return (
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(p) ||
    /[\\/](__tests__|tests?|spec|e2e)[\\/]/.test(p) ||
    /\/_test\.go$/.test(p) ||
    /\/test_[^/]+\.py$/.test(p) ||
    /\/[^/]+_test\.py$/.test(p)
  );
}

/** Cheap complexity proxy — number of branch keywords in the function text. */
function countComplexity(text: string): number {
  const matches = text.match(/\b(if|else if|for|while|case|catch|\?\s*[^:]+:|&&|\|\|)\b/g) ?? [];
  return 1 + matches.length;
}

/** Heuristic: same nearest package.json scope (looked up via path segments). */
function samePackage(a: string, b: string): boolean {
  // For Phase 3 MVP we approximate with workspace folder + top-level "packages/<name>" prefix.
  const pkgA = packagePrefix(a);
  const pkgB = packagePrefix(b);
  return pkgA === pkgB;
}

function packagePrefix(p: string): string {
  const norm = p.replaceAll('\\', '/');
  const m = norm.match(/(.*?\/(packages|apps)\/[^/]+)/);
  if (m) return m[1]!;
  return norm.split('/').slice(0, -1).join('/');
}

async function loadCurrentText(filePath: string): Promise<string | null> {
  // Prefer the in-memory document so we see unsaved edits.
  const open = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === filePath);
  if (open) return open.getText();
  try {
    const uri = vscode.Uri.file(filePath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return null;
  }
}
