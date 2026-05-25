export function EmptyState({
  title,
  body,
  action,
  icon = 'ripple',
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
  icon?: 'ripple' | 'spark' | 'off';
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-3 py-6">
      <div className="impactflow-empty-card flex w-full max-w-[280px] flex-col items-center gap-3 rounded-xl px-5 py-6 text-center">
        <Glyph icon={icon} />
        <div className="text-fg text-[13px] font-semibold tracking-tight">{title}</div>
        <p className="text-muted text-[11px] leading-relaxed">{body}</p>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="impactflow-cta bg-accent text-accent-fg hover:bg-accent-hover mt-1 rounded-md px-3 py-1.5 text-[11px] font-semibold tracking-wide"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

function Glyph({ icon }: { icon: 'ripple' | 'spark' | 'off' }) {
  if (icon === 'off') {
    return (
      <span className="impactflow-glyph impactflow-glyph-off flex h-12 w-12 items-center justify-center rounded-full">
        <span className="text-[20px] leading-none">⏻</span>
      </span>
    );
  }
  if (icon === 'spark') {
    return (
      <span className="impactflow-glyph impactflow-glyph-spark flex h-12 w-12 items-center justify-center rounded-full">
        <span className="text-[20px] leading-none">✦</span>
      </span>
    );
  }
  return (
    <span className="impactflow-glyph relative flex h-12 w-12 items-center justify-center rounded-full">
      <span className="impactflow-glyph-ring-outer absolute inset-0 rounded-full" />
      <span className="impactflow-glyph-ring-mid absolute inset-[6px] rounded-full" />
      <span className="impactflow-glyph-core relative h-2.5 w-2.5 rounded-full" />
    </span>
  );
}
