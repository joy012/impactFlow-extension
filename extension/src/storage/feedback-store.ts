import type * as vscode from 'vscode';
import { logger } from '../logger.js';

const KEY = 'impactflow.dismissedFindings';
const MAX_DISMISSALS = 200;

interface DismissalRecord {
  fnId: string;
  reason?: string;
  at: number;
}

export class FeedbackStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(): DismissalRecord[] {
    return this.context.workspaceState.get<DismissalRecord[]>(KEY, []);
  }

  isDismissed(fnId: string): boolean {
    return this.list().some((r) => r.fnId === fnId);
  }

  async dismiss(fnId: string, reason?: string): Promise<void> {
    const cur = this.list();
    if (cur.some((r) => r.fnId === fnId)) return;
    cur.push({ fnId, reason, at: Date.now() });
    await this.context.workspaceState.update(KEY, cur.slice(-MAX_DISMISSALS));
    logger.info(`Dismissed finding: ${fnId}${reason ? ` (${reason})` : ''}`);
  }

  async clear(): Promise<void> {
    await this.context.workspaceState.update(KEY, []);
  }

  // G10 — Reset Dismissals command needs a synchronous clear that fires-and-forgets.
  clearDismissals(): void {
    void this.context.workspaceState.update(KEY, []);
  }
}
