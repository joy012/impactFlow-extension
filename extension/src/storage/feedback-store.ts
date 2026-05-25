/**
 * Local store for "Not useful" dismissals.
 * Persists per workspace via workspaceState.
 */

import type * as vscode from 'vscode';
import { logger } from '../logger.js';

const KEY = 'impactflow.dismissedFindings';

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
    // Cap to last 200 dismissals to keep state small.
    const trimmed = cur.slice(-200);
    await this.context.workspaceState.update(KEY, trimmed);
    logger.info(`Dismissed finding: ${fnId}${reason ? ` (${reason})` : ''}`);
  }

  async clear(): Promise<void> {
    await this.context.workspaceState.update(KEY, []);
  }
}
