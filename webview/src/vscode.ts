import type { HostToWebviewMessage, WebviewToHostMessage } from './shared/messages.js';

interface VsCodeApi {
  postMessage(message: WebviewToHostMessage): void;
  getState<T = unknown>(): T | undefined;
  setState<T>(state: T): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

let api: VsCodeApi | undefined;

export function getVsCode(): VsCodeApi {
  if (api) return api;
  if (typeof window === 'undefined' || !window.acquireVsCodeApi) {
    // Standalone dev fallback (npm run dev outside VS Code).
    api = {
      postMessage: (m) => console.log('[vscode-stub] postMessage', m),
      getState: () => undefined,
      setState: () => {},
    };
    return api;
  }
  api = window.acquireVsCodeApi();
  return api;
}

export function onHostMessage(handler: (msg: HostToWebviewMessage) => void): () => void {
  const listener = (event: MessageEvent<HostToWebviewMessage>) => handler(event.data);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
