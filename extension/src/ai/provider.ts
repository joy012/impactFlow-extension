import * as vscode from 'vscode';

export interface ChatRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

export interface ChatModelSummary {
  id: string;
  name: string;
  vendor: string;
  family: string;
}

export interface ChatResult {
  ok: true;
  text: string;
  model: ChatModelSummary;
}

export interface ChatErrorResult {
  ok: false;
  reason: 'no-model' | 'cancelled' | 'rate-limited' | 'cap-exceeded' | 'failed';
  message: string;
}

export type ChatOutcome = ChatResult | ChatErrorResult;

// Returns the user's preferred model if `selectorHint` is provided and matches,
// otherwise the first available model. The user picks providers in VS Code's UI;
// we never see API keys.
export const selectModel = async (
  selectorHint?: string,
): Promise<vscode.LanguageModelChat | null> => {
  // vscode.lm shipped in VS Code 1.95+; guard for older Cursor builds.
  const lm = (vscode as unknown as { lm?: typeof vscode.lm }).lm;
  if (!lm?.selectChatModels) return null;

  let models: vscode.LanguageModelChat[] = [];
  if (selectorHint) {
    const [vendor, family] = selectorHint.split('/');
    models = await lm.selectChatModels({ vendor, family });
  }
  if (models.length === 0) {
    models = await lm.selectChatModels();
  }
  return models[0] ?? null;
};

export const summarizeModel = (model: vscode.LanguageModelChat): ChatModelSummary => ({
  id: model.id,
  name: model.name,
  vendor: model.vendor,
  family: model.family,
});

// Streams the response into `onToken` and returns the concatenated text once done.
// Throws on cancellation or provider error — callers should wrap in try/catch.
export const streamChat = async (
  model: vscode.LanguageModelChat,
  req: ChatRequest,
  token: vscode.CancellationToken,
  onToken: (chunk: string) => void,
): Promise<string> => {
  const messages = [
    vscode.LanguageModelChatMessage.User(`${req.systemPrompt}\n\n${req.userPrompt}`),
  ];

  const response = await model.sendRequest(messages, {}, token);

  let collected = '';
  for await (const chunk of response.text) {
    if (token.isCancellationRequested) break;
    collected += chunk;
    onToken(chunk);
    if (req.maxTokens && estimateTokens(collected) > req.maxTokens) {
      collected += '\n\n_…response capped at maxTokens._';
      break;
    }
  }
  return collected;
};

// Rough token estimate: 1 token ≈ 4 characters for English / code. Good enough
// for capping before we exceed the user's preferred budget.
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
