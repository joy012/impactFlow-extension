/**
 * Document watcher — debounces edits and fires the pipeline.
 */

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

  constructor(
    private readonly handler: ChangeHandler,
    private readonly debounceMs = DEFAULT_DEBOUNCE_MS,
  ) {}

  start(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.scheme !== 'file') return;
        if (!this.isWatched(e.document)) return;
        this.schedule(e.document.uri.fsPath, 'edit');
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.uri.scheme !== 'file' || !this.isWatched(doc)) return;
        this.schedule(doc.uri.fsPath, 'save', 0);
      }),
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (doc.uri.scheme !== 'file' || !this.isWatched(doc)) return;
        this.schedule(doc.uri.fsPath, 'open', 0);
      }),
    );
    logger.info(`Watcher started (debounce=${this.debounceMs}ms).`);
  }

  /** Manual trigger from the "Analyze Now" command. */
  trigger(filePath: string): void {
    this.schedule(filePath, 'manual', 0);
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
      void this.fire({ filePath, reason });
    }, delay);
    this.timers.set(filePath, timer);
  }

  private async fire(n: ChangeNotification): Promise<void> {
    if (this.inflight.has(n.filePath)) {
      // Re-coalesce: schedule another pass after the current one finishes.
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
  // Note: a file is also considered "watched" if its extension matches a known
  // language via parsers/router#languageFor — wiring lives in pipeline.ts.

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
