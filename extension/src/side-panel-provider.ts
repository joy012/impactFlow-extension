import { readFile } from 'node:fs/promises';
import * as vscode from 'vscode';
import { submitFeedback } from './feedback/index.js';
import { isGitRepo } from './git-detect.js';
import { logger } from './logger.js';
import type { Pipeline } from './pipeline.js';
import type {
  FeedbackPayload,
  HostToWebviewMessage,
  WebviewToHostMessage,
} from './shared/messages.js';
import type { FeedbackStore } from './storage/feedback-store.js';

export class SidePanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'impactflow.sidePanel';
  private view: vscode.WebviewView | undefined;
  private snapshotDisposable: vscode.Disposable | undefined;
  private progressDisposable: vscode.Disposable | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly pipeline: Pipeline,
    private readonly feedbackStore: FeedbackStore,
  ) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    const webviewRoot = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [webviewRoot],
    };

    webviewView.webview.html = await this.renderHtml(webviewView.webview, webviewRoot);

    webviewView.webview.onDidReceiveMessage(async (message: WebviewToHostMessage) => {
      try {
        await this.handleMessage(message);
      } catch (err) {
        logger.error('Failed to handle webview message', err);
      }
    });

    this.snapshotDisposable?.dispose();
    this.snapshotDisposable = this.pipeline.onSnapshot((snap) => {
      this.post({ type: 'analysisUpdate', payload: snap });
    });
    this.progressDisposable?.dispose();
    this.progressDisposable = this.pipeline.onProgress((p) => {
      this.post({ type: 'progress', payload: p });
    });
    webviewView.onDidDispose(() => {
      this.snapshotDisposable?.dispose();
      this.snapshotDisposable = undefined;
      this.progressDisposable?.dispose();
      this.progressDisposable = undefined;
    });

    this.post({ type: 'init', payload: this.initPayload() });
  }

  post(message: HostToWebviewMessage): void {
    this.view?.webview.postMessage(message);
  }

  reveal(): void {
    this.view?.show?.(true);
  }

  showFeedback(prefillType: FeedbackPayload['type'] = 'general'): void {
    this.reveal();
    this.post({ type: 'showFeedback', payload: { prefillType } });
  }

  private initPayload() {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return {
      extensionVersion: this.context.extension.packageJSON.version as string,
      vscodeVersion: vscode.version,
      enabled: vscode.workspace.getConfiguration('impactflow').get<boolean>('enable', true),
      isGitRepo: isGitRepo(folder),
      feedback: {
        enable: vscode.workspace
          .getConfiguration('impactflow.feedback')
          .get<boolean>('enable', true),
        githubIssuesUrl: vscode.workspace
          .getConfiguration('impactflow.feedback')
          .get<string>('githubIssuesUrl', ''),
      },
    };
  }

  private async handleMessage(message: WebviewToHostMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.post({ type: 'init', payload: this.initPayload() });
        return;
      case 'submitFeedback': {
        const result = await submitFeedback(message.payload, this.context);
        this.post({ type: 'feedbackResult', payload: result });
        return;
      }
      case 'openExternal':
        await vscode.env.openExternal(vscode.Uri.parse(message.payload.url));
        return;
      case 'runCommand':
        await vscode.commands.executeCommand(message.payload.command);
        return;
      case 'dismissFinding': {
        await this.feedbackStore.dismiss(message.payload.fnId, message.payload.reason);
        await this.pipeline.analyzeOpenDocuments();
        return;
      }
      case 'copyToClipboard': {
        await vscode.env.clipboard.writeText(message.payload.text);
        vscode.window.setStatusBarMessage(message.payload.toast ?? 'Copied to clipboard.', 2000);
        return;
      }
      case 'revealFunction': {
        const uri = vscode.Uri.file(message.payload.filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        const line = Math.max(0, message.payload.line - 1);
        const pos = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        return;
      }
      default: {
        const exhaustive: never = message;
        logger.warn(`Unhandled webview message: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  private async renderHtml(webview: vscode.Webview, root: vscode.Uri): Promise<string> {
    const indexUri = vscode.Uri.joinPath(root, 'index.html');
    let html: string;
    try {
      html = await readFile(indexUri.fsPath, 'utf8');
    } catch (err) {
      logger.error('Webview index.html missing — did you run `pnpm build:webview`?', err);
      return this.fallbackHtml();
    }

    html = html.replace(/(src|href)="\/?(.+?)"/g, (_match, attr, path) => {
      if (/^(https?:|data:|vscode-webview:|#)/.test(path)) return `${attr}="${path}"`;
      const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(root, path));
      return `${attr}="${assetUri}"`;
    });

    const nonce = newNonce();
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
      'connect-src https:',
    ].join('; ');

    html = html
      .replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="${csp}">`)
      .replace(/<script /g, `<script nonce="${nonce}" `);

    return html;
  }

  private fallbackHtml(): string {
    return `<!DOCTYPE html><html><body style="font-family:var(--vscode-font-family);padding:1rem;color:var(--vscode-foreground)">
      <h3>ImpactFlow</h3>
      <p>Webview build not found. Run <code>pnpm build</code> in the extension root.</p>
    </body></html>`;
  }
}

function newNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
