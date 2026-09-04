"use client";

import { Sparkles, X } from "lucide-react";
import { useState } from "react";

export type ProactiveSuggestionItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  dueDate: string | null;
  priority: number;
};

type Props = {
  suggestions: ProactiveSuggestionItem[];
  onDismiss?: (id: string) => void;
  className?: string;
};

function kindAccent(kind: string): string {
  switch (kind) {
    case "deadline":
    case "renewal":
      return "border-amber-500/35 bg-[color-mix(in_srgb,#f59e0b_16%,var(--surface))]";
    case "workspace_recommendation":
      return "border-brand/25 bg-brand-light/30";
    default:
      return "border-border-subtle bg-surface";
  }
}

export default function GideonProactiveSuggestions({
  suggestions,
  onDismiss,
  className = "",
}: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [dismissing, setDismissing] = useState<string | null>(null);

  const visible = suggestions.filter((s) => !hidden.has(s.id));
  if (visible.length === 0) return null;

  const dismiss = async (id: string) => {
    setDismissing(id);
    try {
      const res = await fetch(`/api/guardian/suggestions/${id}`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("dismiss failed");
      setHidden((prev) => new Set(prev).add(id));
      onDismiss?.(id);
    } catch {
      setHidden((prev) => new Set(prev).add(id));
    } finally {
      setDismissing(null);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        <Sparkles className="h-3.5 w-3.5 text-brand" aria-hidden />
        Gideon noticed
      </div>
      <ul className="space-y-2">
        {visible.map((item) => (
          <li
            key={item.id}
            className={`rounded-xl border px-3 py-2.5 ${kindAccent(item.kind)}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {item.title}
                </p>
                {item.body ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                    {item.body}
                  </p>
                ) : null}
                {item.dueDate ? (
                  <p className="mt-1 text-[10px] font-medium text-ink-muted">
                    Due {item.dueDate}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void dismiss(item.id)}
                disabled={dismissing === item.id}
                aria-label="Dismiss suggestion"
                className="shrink-0 rounded-full p-1 text-ink-muted hover:bg-white/80 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
