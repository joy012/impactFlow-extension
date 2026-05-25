import { useEffect, useState } from 'react';
import type { FeedbackPayload, FeedbackResult, FeedbackType } from '../shared/messages.js';
import { getVsCode } from '../vscode.js';

const TYPE_OPTIONS: Array<{ value: FeedbackType; label: string }> = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature request' },
  { value: 'general', label: 'General feedback' },
];

export function FeedbackForm({
  prefillType,
  result,
  onResultDismiss,
}: {
  prefillType: FeedbackType;
  result: FeedbackResult | undefined;
  onResultDismiss: () => void;
}) {
  const [type, setType] = useState<FeedbackType>(prefillType);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reproSteps, setReproSteps] = useState('');
  const [email, setEmail] = useState('');
  const [attachLogs, setAttachLogs] = useState(false);
  const [attachEnv, setAttachEnv] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setType(prefillType), [prefillType]);

  // Stop the spinner whenever a result arrives.
  useEffect(() => {
    if (result) setSubmitting(false);
  }, [result]);

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !submitting;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    const payload: FeedbackPayload = {
      type,
      title: title.trim().slice(0, 120),
      description: description.trim().slice(0, 2000),
      reproSteps: type === 'bug' && reproSteps.trim() ? reproSteps.trim() : undefined,
      email: email.trim() || undefined,
      attachLogs,
      attachEnv,
    };
    getVsCode().postMessage({ type: 'submitFeedback', payload });
  };

  const reset = () => {
    setTitle('');
    setDescription('');
    setReproSteps('');
    setEmail('');
    setAttachLogs(false);
    setAttachEnv(true);
    onResultDismiss();
  };

  if (result?.ok) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <div className="text-ok text-sm font-medium">Thanks — sent.</div>
        <p className="text-muted max-w-xs text-xs">{result.message}</p>
        <button
          type="button"
          onClick={reset}
          className="bg-accent text-accent-fg hover:bg-accent-hover rounded px-3 py-1 text-xs"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 px-3 py-3">
      <p className="text-muted text-[11px] leading-relaxed">
        Submitting will send this content over HTTPS to the maintainer. No source code is included
        unless you tick "attach logs" below.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-[11px]">Type</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as FeedbackType)}
          className="text-xs"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-[11px]">Title</span>
        <input
          type="text"
          required
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short summary"
          className="text-xs"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted text-[11px]">Description</span>
        <textarea
          required
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="What happened? What did you expect?"
          className="resize-y text-xs"
        />
      </label>

      {type === 'bug' && (
        <label className="flex flex-col gap-1">
          <span className="text-muted text-[11px]">Reproduction steps (optional)</span>
          <textarea
            value={reproSteps}
            onChange={(e) => setReproSteps(e.target.value)}
            rows={3}
            className="resize-y text-xs"
          />
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-muted text-[11px]">Your email (optional, for follow-up)</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="leave blank to stay anonymous"
          className="text-xs"
        />
      </label>

      <div className="flex flex-col gap-1.5 text-[11px]">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={attachEnv}
            onChange={(e) => setAttachEnv(e.target.checked)}
          />
          <span>Include environment (OS, VS Code version, extension version)</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={attachLogs}
            onChange={(e) => setAttachLogs(e.target.checked)}
          />
          <span>Attach recent ImpactFlow logs (no source code)</span>
        </label>
      </div>

      {result && !result.ok && (
        <div className="border-danger/40 bg-danger/10 text-danger rounded border px-2 py-1.5 text-[11px]">
          <div>{result.message}</div>
          {result.fallbackUrl && (
            <button
              type="button"
              onClick={() =>
                getVsCode().postMessage({
                  type: 'openExternal',
                  payload: { url: result.fallbackUrl! },
                })
              }
              className="text-link mt-1 underline"
            >
              Open on GitHub
            </button>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={reset}
          className="rounded px-3 py-1 text-xs text-muted hover:text-fg"
        >
          Reset
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="bg-accent text-accent-fg hover:bg-accent-hover rounded px-3 py-1 text-xs disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}
