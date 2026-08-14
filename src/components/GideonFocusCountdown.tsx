"use client";

import { useEffect, useState } from "react";
import { Timer, X } from "lucide-react";
import {
  formatCountdown,
  remainingMs,
  type GideonFocusBlock,
} from "@/lib/gideon/focusBlock";
import { formatGuardianTimeLabel } from "@/lib/timezone";

export default function GideonFocusCountdown({
  block,
  timeZone,
  onStop,
}: {
  block: GideonFocusBlock;
  timeZone: string;
  onStop: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [block.endsAt]);

  const left = remainingMs(block, new Date(now));
  const done = left <= 0;
  const endLabel = formatGuardianTimeLabel(new Date(block.endsAt), timeZone);
  const urgent = !done && left <= 5 * 60_000;

  return (
    <div
      className={`shrink-0 border-b px-4 py-2 sm:px-8 ${
        done
          ? "border-stone-200 bg-stone-50"
          : urgent
            ? "border-amber-200 bg-amber-50"
            : "border-brand/20 bg-brand-light/40"
      }`}
      role="timer"
      aria-live="polite"
      aria-label={
        done
          ? `${block.label} complete`
          : `${formatCountdown(left)} left in ${block.label}`
      }
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <Timer
          className={`h-4 w-4 shrink-0 ${
            done ? "text-ink-muted" : urgent ? "text-amber-800" : "text-brand"
          }`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p
            className={`font-mono text-base font-semibold tabular-nums leading-none ${
              urgent ? "text-amber-950" : "text-foreground"
            }`}
          >
            {done ? "Done" : formatCountdown(left)}
            {!done ? (
              <span className="ml-1.5 font-sans text-[11px] font-medium text-ink-muted">
                left
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-ink-muted">
            {block.label}
            {done ? ` · ended ${endLabel}` : ` · until ${endLabel}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop focus countdown"
          className="rounded-full p-1.5 text-ink-muted transition hover:bg-white/80 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
