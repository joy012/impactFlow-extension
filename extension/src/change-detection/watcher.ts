import * as vscode from 'vscode';
import { logger } from '../logger.js';

const DEFAULT_DEBOUNCE_MS = 400;

export interface ChangeNotification {
  filePath: string;
  reason: 'edit' | 'save' | 'open' | 'manual';
}

export type ChangeHandler = (n: ChangeNotification) => void | Promise<void>;

export class DocumentWatcher implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private timers = new Map<string, NodeJS.Timeout>();
  private inflight = new Set<string>();
  // Counter (not boolean) so nested pauseFor() calls compose safely.
  private paused = 0;

  constructor(
    private readonly handler: ChangeHandler,
    private readonly debounceMs = DEFAULT_DEBOUNCE_MS,
  ) {}

  start(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.paused > 0) return;
        if (e.document.uri.scheme !== 'file') return;
        if (!this.isWatched(e.document)) return;
        this.schedule(e.document.uri.fsPath, 'edit');
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (this.paused > 0) return;
        if (doc.uri.scheme !== 'file' || !this.isWatched(doc)) return;
        this.schedule(doc.uri.fsPath, 'save', 0);
      }),
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (this.paused > 0) return;
        if (doc.uri.scheme !== 'file' || !this.isWatched(doc)) return;
        this.schedule(doc.uri.fsPath, 'open', 0);
      }),
    );
    logger.info(`Watcher started (debounce=${this.debounceMs}ms).`);
  }

  trigger(filePath: string): void {
    this.schedule(filePath, 'manual', 0);
  }

  // Bulk operations (dead-code scan, deep-bench) open documents via VS Code
  // RPCs which fire onDidOpenTextDocument and would otherwise flood the
  // pipeline + flicker the side-panel progress bar. Wrap the bulk op so the
  // watcher ignores those open events for its duration.
  async pauseFor<T>(fn: () => Promise<T>): Promise<T> {
    this.paused++;
    try {
      return await fn();
    } finally {
      this.paused--;
    }
  }

  private schedule(
    filePath: string,
    reason: ChangeNotification['reason'],
    delay = this.debounceMs,
  ): void {
    const existing = this.timers.get(filePath);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.timers.delete(filePath);
      this.fire({ filePath, reason }).catch((err) =>
        logger.error(`watcher fire failed for ${filePath}`, err),
      );
    }, delay);
    this.timers.set(filePath, timer);
  }

  private async fire(n: ChangeNotification): Promise<void> {
    if (this.inflight.has(n.filePath)) {
      // Coalesce: re-schedule another pass after the in-flight one completes.
      this.schedule(n.filePath, n.reason);
      return;
    }
    this.inflight.add(n.filePath);
    try {
      await this.handler(n);
    } catch (err) {
      logger.error(`Watcher handler failed for ${n.filePath}`, err);
    } finally {
      this.inflight.delete(n.filePath);
    }
  }

  private isWatched(doc: vscode.TextDocument): boolean {
    const cfg = vscode.workspace.getConfiguration('impactflow');
    if (!cfg.get<boolean>('enable', true)) return false;
    const langs = cfg.get<string[]>('languages', []) ?? [];
    return langs.includes(doc.languageId);
  }

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
