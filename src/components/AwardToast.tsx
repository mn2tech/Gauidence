"use client";

import { useEffect, useState } from "react";
import {
  Award,
  Camera,
  FileText,
  MessageCircle,
  NotebookPen,
  Search,
  Shield,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { awardByKey, type AwardKey } from "@/lib/awards/definitions";

const ICONS = {
  first_vault: Users,
  first_document: FileText,
  photo_capture: Camera,
  first_daily_log: NotebookPen,
  first_ask_gideon: MessageCircle,
  first_research: Search,
  setup_complete: Trophy,
  week_of_notes: Award,
} as const;

/**
 * Celebrates newly earned awards with a short Gideon-style toast.
 */
export default function AwardToast() {
  const [queue, setQueue] = useState<AwardKey[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onEarned = (e: Event) => {
      const keys = (e as CustomEvent<{ keys?: AwardKey[] }>).detail?.keys;
      if (!keys?.length) return;
      setQueue((prev) => [...prev, ...keys]);
      setVisible(true);
    };
    window.addEventListener("guardian:award-earned", onEarned);
    return () => window.removeEventListener("guardian:award-earned", onEarned);
  }, []);

  useEffect(() => {
    if (!visible || queue.length === 0) return;
    const t = window.setTimeout(() => {
      setQueue((prev) => {
        const next = prev.slice(1);
        if (next.length === 0) setVisible(false);
        return next;
      });
    }, 6000);
    return () => window.clearTimeout(t);
  }, [visible, queue]);

  const current = queue[0];
  if (!visible || !current) return null;

  const award = awardByKey(current);
  const Icon = ICONS[current] ?? Shield;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4 sm:justify-end sm:p-6"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-lg shadow-stone-900/10">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Award earned
          </p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">
            {award.title}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">{award.description}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setQueue((prev) => {
              const next = prev.slice(1);
              if (next.length === 0) setVisible(false);
              return next;
            });
          }}
          aria-label="Dismiss award"
          className="rounded-full p-1 text-ink-muted hover:bg-stone-100 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
