import * as os from 'node:os';
import * as vscode from 'vscode';
import { logger } from '../logger.js';
import type { FeedbackPayload, FeedbackResult } from '../shared/messages.js';
import { WEB3FORMS_ACCESS_KEY } from './config.js';

const RATE_LIMIT_MS = 60_000;
const LAST_SUBMIT_KEY = 'impactflow.feedback.lastSubmitAt';

export async function submitFeedback(
  payload: FeedbackPayload,
  context: vscode.ExtensionContext,
): Promise<FeedbackResult> {
  const cfg = vscode.workspace.getConfiguration('impactflow.feedback');
  const enabled = cfg.get<boolean>('enable', true);
  if (!enabled) {
    return { ok: false, via: 'failed', message: 'Feedback is disabled in settings.' };
  }

  const last = context.workspaceState.get<number>(LAST_SUBMIT_KEY, 0);
  if (Date.now() - last < RATE_LIMIT_MS) {
    return {
      ok: false,
      via: 'failed',
      message: 'Please wait a moment before sending another submission.',
    };
  }

  const endpoint = cfg.get<string>('endpoint', 'https://api.web3forms.com/submit');
  const includeEnv = cfg.get<boolean>('includeEnv', true);
  const githubUrl = cfg.get<string>('githubIssuesUrl', '');

  const env = includeEnv ? collectEnv(context) : undefined;
  const body = buildBody(payload, env);

  if (!WEB3FORMS_ACCESS_KEY || WEB3FORMS_ACCESS_KEY.startsWith('REPLACE_')) {
    logger.warn('Feedback endpoint access_key not configured; falling back to GitHub.');
    return githubFallback(payload, githubUrl, 'access_key not configured');
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      logger.error(`Feedback endpoint returned ${res.status}: ${txt}`);
      return githubFallback(payload, githubUrl, `endpoint returned ${res.status}`);
    }
    await context.workspaceState.update(LAST_SUBMIT_KEY, Date.now());
    logger.info(`Feedback submitted (type=${payload.type})`);
    return { ok: true, via: 'endpoint', message: 'Thanks — your feedback was sent.' };
  } catch (err) {
    logger.error('Feedback network error', err);
    return githubFallback(payload, githubUrl, 'network error');
  }
}

function buildBody(payload: FeedbackPayload, env: Record<string, string> | undefined) {
  const lines: string[] = [];
  lines.push(`Type: ${payload.type}`);
  lines.push(`Title: ${payload.title}`);
  lines.push('');
  lines.push('Description:');
  lines.push(payload.description);
  if (payload.reproSteps) {
    lines.push('');
    lines.push('Repro steps:');
    lines.push(payload.reproSteps);
  }
  if (env) {
    lines.push('');
    lines.push('Environment:');
    for (const [k, v] of Object.entries(env)) lines.push(`  ${k}: ${v}`);
  }
  if (payload.attachLogs) {
    lines.push('');
    lines.push('Recent log lines (last 200):');
    lines.push(logger.recent(200).join('\n'));
  }

  return {
    access_key: WEB3FORMS_ACCESS_KEY,
    subject: `[ImpactFlow ${payload.type}] ${payload.title}`,
    from_name: 'ImpactFlow Extension',
    email: payload.email || 'anonymous@impactflow.local',
    message: lines.join('\n'),
    botcheck: '', // honeypot
  };
}

function collectEnv(context: vscode.ExtensionContext): Record<string, string> {
  return {
    extensionVersion: String(context.extension.packageJSON.version),
    vscodeVersion: vscode.version,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    nodeVersion: process.version,
  };
}

function githubFallback(
  payload: FeedbackPayload,
  githubUrl: string,
  reason: string,
): FeedbackResult {
  if (!githubUrl) {
    return {
      ok: false,
      via: 'failed',
      message: `Could not submit (${reason}) and no GitHub fallback configured.`,
    };
  }
  const labels = payload.type === 'bug' ? 'bug' : payload.type === 'feature' ? 'enhancement' : '';
  const url = new URL(githubUrl);
  url.searchParams.set('title', payload.title);
  url.searchParams.set(
    'body',
    `**Type:** ${payload.type}\n\n${payload.description}\n\n${payload.reproSteps ? `**Repro:**\n${payload.reproSteps}` : ''}`,
  );
  if (labels) url.searchParams.set('labels', labels);
  return {
    ok: false,
    via: 'github',
    message: `Submission could not be sent automatically (${reason}). Open on GitHub instead?`,
    fallbackUrl: url.toString(),
  };
}
