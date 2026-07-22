"use client";

import {
  Award,
  Camera,
  FileText,
  Lock,
  MessageCircle,
  NotebookPen,
  Search,
  Trophy,
  Users,
} from "lucide-react";
import { useAwards } from "@/hooks/useAwards";
import type { AwardKey } from "@/lib/awards/definitions";

const ICONS: Record<AwardKey, typeof Award> = {
  first_vault: Users,
  first_document: FileText,
  photo_capture: Camera,
  first_daily_log: NotebookPen,
  first_ask_gideon: MessageCircle,
  first_research: Search,
  setup_complete: Trophy,
  week_of_notes: Award,
};

/**
 * Compact awards gallery on the dashboard.
 */
export default function AwardsPanel({ compact = false }: { compact?: boolean }) {
  const { awards, earnedCount, totalCount, loading } = useAwards();

  if (loading) return null;

  const sorted = [...awards].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">
            Your awards
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {earnedCount} of {totalCount} earned — recognition for building your
            vault.
          </p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand">
          <Trophy className="h-4 w-4" aria-hidden />
        </span>
      </div>

      <ul
        className={
          compact
            ? "mt-4 flex flex-wrap gap-2"
            : "mt-4 grid gap-2 sm:grid-cols-2"
        }
      >
        {sorted.map((award) => {
          const Icon = ICONS[award.key];
          const earned = award.earned;
          return (
            <li
              key={award.key}
              title={award.description}
              className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
                earned
                  ? "border-amber-200 bg-amber-50/70"
                  : "border-stone-200 bg-stone-50/60"
              }`}
            >
              <span
                className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  earned
                    ? "bg-amber-100 text-amber-700"
                    : "bg-stone-200 text-stone-500"
                }`}
              >
                {earned ? (
                  <Icon className="h-4 w-4" aria-hidden />
                ) : (
                  <Lock className="h-3.5 w-3.5" aria-hidden />
                )}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold ${
                    earned ? "text-foreground" : "text-ink-muted"
                  }`}
                >
                  {award.title}
                </p>
                {!compact && (
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                    {award.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
