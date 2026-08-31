"use client";

import { ArrowRight, MapPin } from "lucide-react";

type Props = {
  activeSpaceName: string;
  suggestedSpaceName: string;
  onContinue: () => void;
  onStay: () => void;
  busy?: boolean;
};

/** Offer to move the conversation to the Space the user was clearly talking about. */
export default function SpaceContinueBanner({
  activeSpaceName,
  suggestedSpaceName,
  onContinue,
  onStay,
  busy = false,
}: Props) {
  return (
    <div className="rounded-2xl border border-brand/25 bg-brand-light/30 px-3.5 py-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <MapPin className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-brand">
            Wrong space for this chat?
          </p>
          <p className="mt-1 text-sm leading-snug text-foreground">
            This looks like{" "}
            <span className="font-semibold">{suggestedSpaceName}</span>. You&apos;re
            in <span className="font-semibold">{activeSpaceName}</span>, so this
            thread is saving there.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onContinue}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              Continue in {suggestedSpaceName}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onStay}
              className="inline-flex items-center rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:bg-stone-50 disabled:opacity-50"
            >
              Stay in {activeSpaceName}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
