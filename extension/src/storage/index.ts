/**
 * Per-workspace persistence — Phase 1.
 * In-memory project graph + on-disk JSON cache.
 */

import type * as vscode from 'vscode';

export class GraphStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async load(): Promise<void> {
    // Phase 1.
  }

  async save(): Promise<void> {
    // Phase 1.
  }
}
