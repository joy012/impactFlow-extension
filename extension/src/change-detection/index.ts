/**
 * Change Detection Engine — Phase 1.
 *
 * Listens to workspace.onDidChangeTextDocument (debounced) and git events,
 * emits ChangeEvent for downstream pipeline stages.
 */

export interface ChangeEvent {
  file: string;
  changedFunctions: string[];
  diffAST: unknown;
}

export function startChangeDetection(): void {
  // Phase 1.
}
