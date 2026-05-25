/**
 * F15 — webhook notify on high-risk diffs.
 *
 * Opt-in via `impactflow.notify.webhookUrl` setting (empty string = disabled).
 * Throttled: max 1 notification per 5 min per file+fn combo to prevent spam.
 */

import * as vscode from 'vscode';
import { logger } from './logger.js';
import type { AnalysisSnapshot } from './shared/messages.js';

const THROTTLE_MS = 5 * 60 * 1000;
const lastSentAt = new Map<string, number>();

export async function notifyHighRisk(snap: AnalysisSnapshot): Promise<void> {
  const url = vscode.workspace.getConfiguration('impactflow.notify').get<string>('webhookUrl', '');
  if (!url) return;

  const now = Date.now();
  for (const file of snap.files) {
    for (const fn of file.modified) {
      if (fn.topSeverity !== 'high') continue;
      const key = `${file.path}::${fn.id}`;
      const last = lastSentAt.get(key) ?? 0;
      if (now - last < THROTTLE_MS) continue;
      lastSentAt.set(key, now);
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'impactflow',
            severity: 'high',
            function: fn.name,
            file: file.path,
            risk: fn.risk?.score ?? null,
            impactedCallers: fn.impacted?.length ?? 0,
            at: new Date().toISOString(),
          }),
        });
      } catch (err) {
        logger.debug(`webhook POST failed: ${(err as Error).message}`);
      }
    }
  }
}
