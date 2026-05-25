/**
 * Opt-in telemetry. No-ops until `impactflow.telemetry` is true AND a
 * connection string is configured at build time.
 *
 * What we send: anonymous counts only. Never source, paths, identifiers, or diffs.
 * What we don't send: anything else.
 */

import * as vscode from 'vscode';
import { logger } from '../logger.js';

const CONNECTION_STRING = process.env.IMPACTFLOW_TELEMETRY_KEY ?? '';

export type TelemetryEvent =
  | { name: 'extension.activated'; props?: { vscodeVersion: string } }
  | {
      name: 'analysis.completed';
      props?: { fileCount: number; high: number; medium: number; low: number; durationMs: number };
    }
  | { name: 'feedback.submitted'; props?: { kind: string; via: string } }
  | { name: 'finding.dismissed'; props?: Record<string, never> };

class Telemetry {
  private enabled = false;
  private extensionVersion = '0.0.0';

  init(context: vscode.ExtensionContext): void {
    this.extensionVersion = String(context.extension.packageJSON.version);
    this.refresh();
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('impactflow.telemetry')) this.refresh();
      }),
    );
  }

  private refresh(): void {
    const optedIn = vscode.workspace
      .getConfiguration('impactflow')
      .get<boolean>('telemetry', false);
    this.enabled = optedIn && CONNECTION_STRING.length > 0;
    if (optedIn && !CONNECTION_STRING) {
      logger.debug('Telemetry opted in but no connection string at build time — disabled.');
    }
  }

  send(event: TelemetryEvent): void {
    if (!this.enabled) return;
    // Real wiring happens in Phase 6 publish step:
    //   import TelemetryReporter from '@vscode/extension-telemetry';
    //   reporter.sendTelemetryEvent(event.name, normalized);
    // We keep the stub here so opting out is the verified default.
    logger.debug(`[telemetry stub] ${event.name} ${JSON.stringify(event.props ?? {})}`);
  }

  get version(): string {
    return this.extensionVersion;
  }
}

export const telemetry = new Telemetry();
