"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  ChevronRight,
  FolderKanban,
  Loader2,
  Settings2,
  Users,
} from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import type { WorldCard } from "@/lib/guardian-world/types";
import { ASK_GIDEON_PATH, HISTORY_PATH, DOCUMENTS_PATH } from "@/lib/routes";
import { VAULTS_PATH } from "@/lib/simple-home/routing";

type WorldResponse = {
  cards: WorldCard[];
  error?: string;
};

function formatRelativeUpdated(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Updated just now";
  if (mins < 60) return `Updated ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `Updated ${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `Updated ${days}d ago`;
  return `Updated ${new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

export default function MyWorldScreen() {
  const router = useRouter();
  const { switchProfile } = useActiveProfile();
  const [cards, setCards] = useState<WorldCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/guardian/world");
      const body = (await res.json().catch(() => ({}))) as WorldResponse;
      if (!res.ok) {
        setError(body.error ?? "Couldn't load My World.");
        setCards([]);
        return;
      }
      setCards(body.cards ?? []);
    } catch {
      setError("Couldn't reach Guardian. Check your connection.");
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openContext(card: WorldCard) {
    await switchProfile(card.spaceId);
    router.push(`${DOCUMENTS_PATH}#documents-${card.spaceId}`);
  }

  return (
    <div className="simple-home-page mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 sm:py-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            My World
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            What Guardian knows about the important parts of your life and work.
          </p>
        </div>
        <Link
          href={VAULTS_PATH}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-2 text-sm font-semibold text-ink-muted hover:bg-stone-50 hover:text-foreground"
        >
          <Settings2 className="h-4 w-4" aria-hidden />
          Manage
        </Link>
      </header>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading My World…
        </p>
      ) : cards.length === 0 ? (
        <div className="simple-home-card space-y-3 p-6 text-center">
          <FolderKanban className="mx-auto h-6 w-6 text-brand" />
          <p className="font-semibold">Your world is empty</p>
          <p className="text-sm text-ink-muted">
            Create a space for work, family, or a project — or tell Guardian
            something and it will organize what it can.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Link
              href={VAULTS_PATH}
              className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Add a space
            </Link>
            <Link
              href={HISTORY_PATH}
              className="rounded-xl border border-stone-200 px-5 py-2.5 text-sm font-semibold hover:bg-stone-50"
            >
              Tell Guardian
            </Link>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {cards.map((card) => {
            const updated = formatRelativeUpdated(card.stats.lastUpdatedAt);
            return (
              <li key={card.spaceId} className="simple-home-card p-4">
                <button
                  type="button"
                  onClick={() => void openContext(card)}
                  className="group flex w-full items-start gap-3 text-left"
                >
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-600 group-hover:bg-brand-light group-hover:text-brand">
                    <FolderKanban className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span>
                        <span className="block font-semibold text-foreground">
                          {card.name}
                        </span>
                        <span className="mt-0.5 block text-xs font-medium text-ink-muted">
                          {card.typeLabel}
                        </span>
                      </span>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-stone-300" />
                    </span>
                    {card.description ? (
                      <span className="mt-2 line-clamp-2 block text-sm text-ink-muted">
                        {card.description}
                      </span>
                    ) : null}
                    <span className="mt-2 block text-sm text-foreground/90">
                      {card.summaryLine}
                    </span>
                    {card.stats.recentActivityTitle ? (
                      <span className="mt-1.5 line-clamp-1 block text-xs text-ink-muted">
                        Recent: {card.stats.recentActivityTitle}
                      </span>
                    ) : null}
                    <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                      {card.stats.openActionCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-800">
                          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                          {card.stats.openActionCount} open
                        </span>
                      ) : null}
                      {card.stats.upcomingDeadlineCount > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                          {card.stats.upcomingDeadlineCount} due soon
                        </span>
                      ) : null}
                      {card.stats.linkedPeopleCount > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" aria-hidden />
                          {card.peoplePreview.length
                            ? card.peoplePreview.join(", ")
                            : `${card.stats.linkedPeopleCount} linked`}
                          {card.stats.linkedPeopleCount >
                          card.peoplePreview.length
                            ? ` +${card.stats.linkedPeopleCount - card.peoplePreview.length}`
                            : ""}
                        </span>
                      ) : null}
                      {updated ? <span>{updated}</span> : null}
                    </span>
                  </span>
                </button>
                <div className="mt-3 flex flex-wrap gap-2 pl-[3.25rem]">
                  <Link
                    href={`${HISTORY_PATH}?spaceId=${encodeURIComponent(card.spaceId)}`}
                    className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-semibold text-ink-muted hover:bg-stone-50 hover:text-foreground"
                  >
                    History
                  </Link>
                  <Link
                    href={`${ASK_GIDEON_PATH}?profileId=${encodeURIComponent(card.spaceId)}`}
                    className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-semibold text-ink-muted hover:bg-stone-50 hover:text-foreground"
                  >
                    Ask Gideon
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
