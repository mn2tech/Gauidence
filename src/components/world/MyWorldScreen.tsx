"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  ChevronRight,
  FolderKanban,
  Loader2,
  Map as MapIcon,
  Package,
  Search,
  Users,
} from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import type { WorldCard } from "@/lib/guardian-world/types";
import type {
  WorldAttentionItem,
  WorldEntitySummary,
  WorldOverview,
} from "@/lib/world/apiTypes";
import type { WorldTabId } from "@/lib/world/labels";
import {
  ASK_GIDEON_PATH,
  DOCUMENTS_PATH,
  HISTORY_PATH,
  WORLD_INBOX_PATH,
  WORLD_MAP_PATH,
  worldEntityHref,
} from "@/lib/routes";
import { VAULTS_PATH } from "@/lib/simple-home/routing";

const TABS: Array<{ id: WorldTabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "people", label: "People" },
  { id: "organizations", label: "Organizations" },
  { id: "events", label: "Events" },
  { id: "things", label: "Things" },
  { id: "map", label: "Map" },
];

function formatRelative(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function CountChip({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2 text-center">
      <div className="text-lg font-semibold tabular-nums text-foreground">
        {value}
      </div>
      <div className="text-xs text-ink-muted">{label}</div>
    </div>
  );
}

function EntityRow({ entity }: { entity: WorldEntitySummary }) {
  return (
    <Link
      href={worldEntityHref(entity.id)}
      className="group flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-stone-50"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-600 group-hover:bg-brand-light group-hover:text-brand">
        {entity.group === "people" ? (
          <Users className="h-4 w-4" aria-hidden />
        ) : entity.group === "organizations" ? (
          <Building2 className="h-4 w-4" aria-hidden />
        ) : entity.group === "events" ? (
          <CalendarClock className="h-4 w-4" aria-hidden />
        ) : (
          <Package className="h-4 w-4" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">{entity.name}</span>
        <span className="mt-0.5 block text-xs text-ink-muted">
          {entity.typeLabel}
          {entity.lastSeenAt
            ? ` · ${formatRelative(entity.lastSeenAt) ?? ""}`
            : ""}
        </span>
        {entity.description ? (
          <span className="mt-1 line-clamp-2 block text-sm text-ink-muted">
            {entity.description}
          </span>
        ) : null}
      </span>
      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-stone-300" />
    </Link>
  );
}

function AttentionRow({ item }: { item: WorldAttentionItem }) {
  return (
    <li className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{item.title}</p>
          {item.description ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">
              {item.description}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-ink-muted">
            {item.dueAt
              ? `Due ${formatRelative(item.dueAt) ?? item.dueAt}`
              : item.eventDate
                ? `On ${item.eventDate}`
                : "Needs a look"}
          </p>
        </div>
      </div>
    </li>
  );
}

export default function MyWorldScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { switchProfile } = useActiveProfile();

  const tabParam = searchParams.get("tab") as WorldTabId | null;
  const activeTab: WorldTabId =
    TABS.some((t) => t.id === tabParam) && tabParam ? tabParam : "overview";

  const [overview, setOverview] = useState<WorldOverview | null>(null);
  const [entities, setEntities] = useState<WorldEntitySummary[]>([]);
  const [cards, setCards] = useState<WorldCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const setTab = useCallback(
    (id: WorldTabId) => {
      if (id === "map") {
        router.push(WORLD_MAP_PATH);
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      if (id === "overview") params.delete("tab");
      else params.set("tab", id);
      const qs = params.toString();
      router.replace(qs ? `/world?${qs}` : "/world");
    },
    [router, searchParams]
  );

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, cardsRes] = await Promise.all([
        fetch("/api/world/overview"),
        fetch("/api/guardian/world"),
      ]);
      const ovBody = (await ovRes.json().catch(() => ({}))) as WorldOverview & {
        error?: string;
      };
      const cardsBody = (await cardsRes.json().catch(() => ({}))) as {
        cards?: WorldCard[];
        error?: string;
      };
      if (!ovRes.ok) {
        setError(ovBody.error ?? "Couldn't load My World.");
        setOverview(null);
      } else {
        setOverview(ovBody);
      }
      setCards(cardsBody.cards ?? []);
    } catch {
      setError("Couldn't reach Guardian. Check your connection.");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGroup = useCallback(async (group: string) => {
    setListLoading(true);
    try {
      const res = await fetch(
        `/api/world/entities?group=${encodeURIComponent(group)}&limit=40`
      );
      const body = (await res.json().catch(() => ({}))) as {
        entities?: WorldEntitySummary[];
        error?: string;
      };
      if (!res.ok) {
        setEntities([]);
        return;
      }
      setEntities(body.entities ?? []);
    } catch {
      setEntities([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (
      activeTab === "people" ||
      activeTab === "organizations" ||
      activeTab === "events" ||
      activeTab === "things"
    ) {
      void loadGroup(activeTab);
    }
  }, [activeTab, loadGroup]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const pool =
      activeTab === "overview"
        ? overview?.important ?? []
        : entities;
    return pool.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q) ||
        e.typeLabel.toLowerCase().includes(q)
    );
  }, [query, overview, entities, activeTab]);

  async function openSpace(card: WorldCard) {
    await switchProfile(card.spaceId);
    router.push(`${DOCUMENTS_PATH}#documents-${card.spaceId}`);
  }

  const displayEntities = searchResults ?? entities;

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
          Spaces
        </Link>
      </header>

      <nav
        className="flex gap-1 overflow-x-auto pb-1"
        aria-label="My World sections"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              activeTab === tab.id || (tab.id === "map" && false)
                ? "bg-foreground text-white"
                : "bg-stone-100 text-ink-muted hover:bg-stone-200 hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people, organizations, things…"
          className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none ring-brand focus:ring-2"
        />
      </label>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading My World…
        </p>
      ) : activeTab === "overview" ? (
        <div className="flex flex-col gap-5">
          {overview ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <CountChip label="People" value={overview.counts.people} />
                <CountChip
                  label="Organizations"
                  value={overview.counts.organizations}
                />
                <CountChip label="Events" value={overview.counts.events} />
                <CountChip label="Things" value={overview.counts.things} />
              </div>

              {overview.inboxPendingCount > 0 ? (
                <Link
                  href={WORLD_INBOX_PATH}
                  className="flex items-center justify-between rounded-xl border border-brand/20 bg-brand-light/40 px-4 py-3 text-sm font-semibold text-brand hover:bg-brand-light"
                >
                  <span>
                    {overview.inboxPendingCount} confirmation
                    {overview.inboxPendingCount === 1 ? "" : "s"} waiting
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : null}

              {overview.needingAttention.length > 0 ? (
                <section className="simple-home-card p-4">
                  <h2 className="text-lg font-bold tracking-tight">
                    Needs your attention
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {overview.needingAttention.map((item) => (
                      <AttentionRow key={item.id} item={item} />
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="simple-home-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-bold tracking-tight">
                    Important to you
                  </h2>
                  <Link
                    href={`${ASK_GIDEON_PATH}?draft=${encodeURIComponent("What do you know about my world?")}`}
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    Ask Gideon
                  </Link>
                </div>
                {(searchResults ?? overview.important).length === 0 ? (
                  <p className="mt-3 text-sm text-ink-muted">
                    As you add documents, email, and notes, Guardian will start
                    building your world.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-stone-100">
                    {(searchResults ?? overview.important).map((e) => (
                      <li key={e.id}>
                        <EntityRow entity={e} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {overview.recentChanges.length > 0 ? (
                <section className="simple-home-card p-4">
                  <h2 className="text-lg font-bold tracking-tight">
                    Recently changed
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {overview.recentChanges.map((c) => (
                      <li key={c.id}>
                        {c.entityId ? (
                          <Link
                            href={worldEntityHref(c.entityId)}
                            className="block rounded-lg px-2 py-2 hover:bg-stone-50"
                          >
                            <p className="font-medium text-foreground">
                              {c.title}
                            </p>
                            <p className="text-xs text-ink-muted">
                              {formatRelative(c.occurredAt)}
                            </p>
                          </Link>
                        ) : (
                          <div className="px-2 py-2">
                            <p className="font-medium text-foreground">
                              {c.title}
                            </p>
                            <p className="text-xs text-ink-muted">
                              {formatRelative(c.occurredAt)}
                            </p>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {overview.upcomingEvents.length > 0 ? (
                <section className="simple-home-card p-4">
                  <h2 className="text-lg font-bold tracking-tight">
                    Upcoming events
                  </h2>
                  <ul className="mt-2 divide-y divide-stone-100">
                    {overview.upcomingEvents.map((e) => (
                      <li key={e.id}>
                        <EntityRow entity={e} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}

          {/* Spaces remain secondary navigation */}
          <section className="simple-home-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold tracking-tight">Your Spaces</h2>
              <Link
                href={VAULTS_PATH}
                className="text-xs font-semibold text-ink-muted hover:text-foreground"
              >
                Manage
              </Link>
            </div>
            {cards.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">
                Spaces are optional folders for work, family, and projects.
                Guardian still builds your world without them.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {cards.slice(0, 6).map((card) => (
                  <li key={card.spaceId}>
                    <button
                      type="button"
                      onClick={() => void openSpace(card)}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-stone-50"
                    >
                      <FolderKanban className="h-4 w-4 shrink-0 text-stone-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{card.name}</span>
                        <span className="block text-xs text-ink-muted">
                          {card.summaryLine}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-stone-300" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <section className="simple-home-card p-4">
          <h2 className="text-lg font-bold tracking-tight capitalize">
            {activeTab}
          </h2>
          {listLoading ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : displayEntities.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              Nothing here yet. Upload documents or tell Gideon about this part
              of your life.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-stone-100">
              {displayEntities.map((e) => (
                <li key={e.id}>
                  <EntityRow entity={e} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="flex flex-wrap gap-2 pb-4 text-sm">
        <Link
          href={HISTORY_PATH}
          className="rounded-xl border border-stone-200 px-4 py-2 font-semibold hover:bg-stone-50"
        >
          History
        </Link>
        <Link
          href={ASK_GIDEON_PATH}
          className="rounded-xl bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark"
        >
          Ask Gideon
        </Link>
        <Link
          href={WORLD_MAP_PATH}
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 px-4 py-2 font-semibold hover:bg-stone-50"
        >
          <MapIcon className="h-4 w-4" /> Map
        </Link>
      </div>
    </div>
  );
}
