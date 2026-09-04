"use client";

import { CalendarPlus, FileUp } from "lucide-react";

type Props = {
  onUpload: () => void;
  onAddToToday: () => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Light empty-Ask guidance: one prompt + two chips.
 * Shown when the chat has no messages yet — not a full onboarding card.
 */
export default function EmptyAskGuidanceChips({
  onUpload,
  onAddToToday,
  disabled = false,
  className = "",
}: Props) {
  return (
    <div className={`space-y-2 ${className}`}>
      <p className="text-sm text-ink-muted">
        Start with something Gideon can help with:
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onUpload}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50 sm:text-sm"
        >
          <FileUp className="h-3.5 w-3.5" aria-hidden />
          Upload a document
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onAddToToday}
          className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-3.5 py-2 text-xs font-semibold text-foreground transition hover:border-brand hover:bg-brand-light/40 disabled:opacity-50 sm:text-sm"
        >
          <CalendarPlus className="h-3.5 w-3.5 text-brand" aria-hidden />
          Add to Today
        </button>
      </div>
    </div>
  );
}
