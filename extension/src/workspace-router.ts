import * as vscode from 'vscode';
import { CoverageEngine } from './coverage/lcov.js';
import { LastTouchedEngine } from './git-blame/last-touched.js';
import { HotspotEngine } from './hotspot/index.js';
import { logger } from './logger.js';

// B6 audit fix — route per-folder engines by the workspace folder containing a file path.
export class WorkspaceEngineRouter {
  private hotspots = new Map<string, HotspotEngine>();
  private lastTouched = new Map<string, LastTouchedEngine>();
  private coverages = new Map<string, CoverageEngine>();
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.refresh();
    this.disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()));
  }

  private refresh(): void {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const seen = new Set<string>();
    for (const f of folders) {
      const root = f.uri.fsPath;
      seen.add(root);
      if (!this.hotspots.has(root)) this.hotspots.set(root, new HotspotEngine(root));
      if (!this.lastTouched.has(root)) this.lastTouched.set(root, new LastTouchedEngine(root));
      if (!this.coverages.has(root)) {
        const cov = new CoverageEngine();
        this.coverages.set(root, cov);
        cov
          .init(root, this.context)
          .catch((err) =>
            logger.warn(`coverage init failed for ${root}: ${(err as Error).message}`),
          );
      }
    }
    // Drop engines for folders that were removed.
    for (const map of [this.hotspots, this.lastTouched, this.coverages]) {
      for (const root of map.keys()) {
        if (!seen.has(root)) map.delete(root);
      }
    }
  }

  hotspotFor(filePath: string): HotspotEngine | undefined {
    return this.engineFor(filePath, this.hotspots);
  }

  lastTouchedFor(filePath: string): LastTouchedEngine | undefined {
    return this.engineFor(filePath, this.lastTouched);
  }

  coverageFor(filePath: string): CoverageEngine | undefined {
    return this.engineFor(filePath, this.coverages);
  }

  private engineFor<T>(filePath: string, map: Map<string, T>): T | undefined {
    let best: { root: string; engine: T } | undefined;
    for (const [root, engine] of map) {
      if (filePath.startsWith(root) && (!best || root.length > best.root.length)) {
        best = { root, engine };
      }
    }
    return best?.engine;
  }

  async reloadCoverage(): Promise<boolean> {
    let anyActive = false;
    await Promise.all(
      [...this.coverages.values()].map(async (cov) => {
        await cov.reload();
        if (cov.isActive()) anyActive = true;
      }),
    );
    return anyActive;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.hotspots.clear();
    this.lastTouched.clear();
    this.coverages.clear();
  }
}
