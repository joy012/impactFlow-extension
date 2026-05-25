export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center">
      <div className="text-sm font-medium">{title}</div>
      <p className="text-muted max-w-xs text-xs leading-relaxed">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="bg-accent text-accent-fg hover:bg-accent-hover mt-2 rounded px-3 py-1 text-xs"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
