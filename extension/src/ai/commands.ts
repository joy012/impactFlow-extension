import { promises as fs } from 'node:fs';
import * as vscode from 'vscode';
import { logger } from '../logger.js';
import { languageFor } from '../parsers/router.js';
import { buildFunctionTable } from '../parsers/typescript/function-table.js';
import type { FnSummary } from '../shared/messages.js';
import { AiResponseCache, buildCacheKey } from './cache.js';
import { explainChangePrompt, reviewHighRiskPrompt, suggestTestsPrompt } from './prompts.js';
import {
  type ChatRequest,
  estimateTokens,
  selectModel,
  streamChat,
  summarizeModel,
} from './provider.js';
import { RateLimiter } from './rate-limiter.js';

type Kind = 'explain' | 'tests' | 'review';

const KIND_META: Record<Kind, { title: string; emoji: string; build: typeof explainChangePrompt }> =
  {
    explain: { title: 'ImpactFlow — Explain Change', emoji: '🔍', build: explainChangePrompt },
    tests: { title: 'ImpactFlow — Suggest Tests', emoji: '🧪', build: suggestTestsPrompt },
    review: { title: 'ImpactFlow — Review High-Risk', emoji: '🚨', build: reviewHighRiskPrompt },
  };

export class AiCommandHandler {
  private readonly cache: AiResponseCache;
  private readonly limiter: RateLimiter;

  constructor() {
    const cfg = vscode.workspace.getConfiguration('impactflow.ai');
    this.cache = new AiResponseCache(cfg.get<number>('cacheTtlHours', 24) * 60 * 60 * 1000);
    this.limiter = new RateLimiter(cfg.get<number>('rateLimitSeconds', 60) * 1000);
  }

  clearCache(): void {
    this.cache.clear();
    this.limiter.reset();
    vscode.window.showInformationMessage('ImpactFlow: AI response cache cleared.');
  }

  async run(
    kind: Kind,
    getCurrentFn: () =>
      | { fn: FnSummary; filePath: string }
      | undefined
      | Promise<{ fn: FnSummary; filePath: string } | undefined>,
  ): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('impactflow.ai');
    if (!cfg.get<boolean>('enable', false)) {
      const open = await vscode.window.showWarningMessage(
        'ImpactFlow AI commands are disabled. Enable `impactflow.ai.enable` in settings?',
        'Open Settings',
      );
      if (open === 'Open Settings') {
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'impactflow.ai.enable',
        );
      }
      return;
    }

    const entry = await getCurrentFn();
    if (!entry) return;

    const fnText = await loadFnText(entry.filePath, entry.fn);
    if (!fnText) {
      vscode.window.showWarningMessage('ImpactFlow: could not locate the function source.');
      return;
    }

    const meta = KIND_META[kind];
    const cacheKey = buildCacheKey(entry.fn.id, hashText(fnText), kind);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.info(`AI cache hit for ${kind}::${entry.fn.id}`);
      await renderMarkdown(meta.title, `${meta.emoji} _(cached)_\n\n${cached}`);
      return;
    }

    const limit = this.limiter.attempt(`${kind}::${entry.fn.id}`);
    if (!limit.allowed) {
      vscode.window.showWarningMessage(
        `ImpactFlow AI: please wait ${Math.ceil(limit.retryAfterMs / 1000)}s before another call on this function.`,
      );
      return;
    }

    const model = await selectModel(cfg.get<string>('preferredModel') || undefined);
    if (!model) {
      vscode.window.showWarningMessage(
        'ImpactFlow: no Language Model provider available. Install GitHub Copilot or another `vscode.lm` provider.',
      );
      return;
    }

    const { systemPrompt, userPrompt } = meta.build(entry.fn, entry.filePath, fnText);
    const request: ChatRequest = {
      systemPrompt,
      userPrompt,
      maxTokens: cfg.get<number>('maxResponseTokens', 1000),
    };

    const promptTokens = estimateTokens(systemPrompt + userPrompt);
    const promptCap = cfg.get<number>('maxPromptTokens', 2000);
    if (promptTokens > promptCap) {
      vscode.window.showWarningMessage(
        `ImpactFlow AI: prompt is ~${promptTokens} tokens, over the ${promptCap} cap. Increase impactflow.ai.maxPromptTokens or trim the function.`,
      );
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `${meta.emoji} ${summarizeModel(model).name} (${promptTokens} tok)`,
        cancellable: true,
      },
      async (progress, token) => {
        let collected = '';
        const editor = await openPreview(meta.title);
        try {
          collected = await streamChat(model, request, token, (chunk) => {
            // Live-update the preview as tokens stream in.
            void editor.append(chunk);
            progress.report({ message: `${estimateTokens(collected + chunk)} tok…` });
          });
        } catch (err) {
          if (token.isCancellationRequested) {
            await editor.append('\n\n_…cancelled._');
            return;
          }
          logger.error(`AI ${kind} failed`, err);
          await editor.append(`\n\n_Error: ${(err as Error).message}_`);
          return;
        }
        if (collected) this.cache.set(cacheKey, collected);
        logger.info(`AI ${kind} ok: ${entry.fn.id} (${estimateTokens(collected)} tok)`);
      },
    );
  }
}

// Minimal markdown preview wrapper that supports streaming appends.
interface PreviewEditor {
  append(chunk: string): Promise<void>;
}

const openPreview = async (title: string): Promise<PreviewEditor> => {
  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: `# ${title}\n\n`,
  });
  const editor = await vscode.window.showTextDocument(doc, { preview: true });
  return {
    async append(chunk: string) {
      await editor.edit((b) => {
        const end = new vscode.Position(doc.lineCount, 0);
        b.insert(end, chunk);
      });
    },
  };
};

const renderMarkdown = async (title: string, body: string): Promise<void> => {
  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: `# ${title}\n\n${body}`,
  });
  await vscode.window.showTextDocument(doc, { preview: true });
};

// Cheap content hash for cache key. Not cryptographically interesting.
const hashText = (text: string): string => {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

// Re-parse the file and find the function by ID so we have its current full text.
const loadFnText = async (filePath: string, fn: FnSummary): Promise<string | null> => {
  if (!languageFor(filePath)) return null;
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const table = buildFunctionTable(filePath, text);
    return table.functions.get(fn.id)?.fullText ?? null;
  } catch {
    return null;
  }
};
