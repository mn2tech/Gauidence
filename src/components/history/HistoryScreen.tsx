"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Calendar,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  HISTORY_FILTERS,
  formatHistoryDayHeading,
  type HistoryEventCard,
  type HistoryFilter,
} from "@/lib/guardian-events/history";
import { ASK_GIDEON_PATH } from "@/lib/simple-home/routing";
import Link from "next/link";

type TimelineDay = { date: string; events: HistoryEventCard[] };

type HistoryResponse = {
  filter: HistoryFilter;
  today: string;
  timeline: TimelineDay[];
  spaceNames: Record<string, string>;
  error?: string;
};

type DetailResponse = {
  card: HistoryEventCard;
  source: { sourceType: string; sourceId: string | null; label: string };
  spaceName: string | null;
  sourceDailyLog: {
    id: string;
    log_date: string;
    title: string | null;
    content: string;
  } | null;
  error?: string;
};

const FILTER_LABELS: Record<HistoryFilter, string> = {
  all: "All",
  personal: "Personal",
  business: "Business",
  meetings: "Meetings",
  decisions: "Decisions",
  tasks: "Tasks",
  documents: "Documents",
  insights: "Guardian Insights",
};

function EventTypeIcon({ type }: { type: string }) {
  const className = "h-4 w-4 shrink-0";
  switch (type) {
    case "meeting":
      return <Users className={className} aria-hidden />;
    case "follow_up":
    case "reminder":
    case "deadline":
    case "task_created":
    case "task_completed":
      return <Clock className={className} aria-hidden />;
    case "document_added":
    case "email":
      return <FileText className={className} aria-hidden />;
    case "guardian_insight":
    case "observation":
      return <Lightbulb className={className} aria-hidden />;
    default:
      return <Calendar className={className} aria-hidden />;
  }
}

export default function HistoryScreen() {
  const searchParams = useSearchParams();
  const spaceIdFilter = searchParams.get("spaceId")?.trim() || "";
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [timeline, setTimeline] = useState<TimelineDay[]>([]);
  const [today, setToday] = useState<string>("");
  const [spaceNames, setSpaceNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tellOpen, setTellOpen] = useState(false);
  const [tellText, setTellText] = useState("");
  const [telling, setTelling] = useState(false);
  const [tellError, setTellError] = useState<string | null>(null);
  const [tellSaved, setTellSaved] = useState(false);
  const [tellAlreadyHad, setTellAlreadyHad] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async (nextFilter: HistoryFilter) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        filter: nextFilter,
        limit: "100",
      });
      if (spaceIdFilter) qs.set("spaceId", spaceIdFilter);
      const res = await fetch(`/api/guardian/events?${qs.toString()}`);
      const body = (await res.json().catch(() => ({}))) as HistoryResponse;
      if (!res.ok) {
        setError(body.error ?? "Couldn't load History.");
        return;
      }
      setTimeline(body.timeline ?? []);
      setToday(body.today ?? "");
      setSpaceNames(body.spaceNames ?? {});
    } catch {
      setError("Couldn't reach Guardian. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [spaceIdFilter]);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  async function handleTellGuardian() {
    const trimmed = tellText.trim();
    if (!trimmed) return;
    setTelling(true);
    setTellError(null);
    try {
      const res = await fetch("/api/guardian/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        deduped?: boolean;
      };
      if (!res.ok) {
        setTellError(body.error ?? "Couldn't save that.");
        return;
      }
      setTellAlreadyHad(Boolean(body.deduped));
      setTellSaved(true);
      setTellText("");
      await load(filter);
    } catch {
      setTellError("Couldn't reach Guardian. Check your connection.");
    } finally {
      setTelling(false);
    }
  }

  async function openDetail(id: string) {
    setDetailId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/guardian/events/${id}`);
      const body = (await res.json().catch(() => ({}))) as DetailResponse;
      if (!res.ok) {
        setDetail({
          card: {
            id,
            eventType: "note",
            typeLabel: "Event",
            title: "Couldn't load",
            summary: body.error ?? "Not found",
            occurredAt: "",
            status: "open",
            actionRequired: false,
            spaceId: null,
            sourceLabel: "",
            sourceType: "manual",
            sourceId: null,
            relatedEntities: [],
          },
          source: { sourceType: "manual", sourceId: null, label: "" },
          spaceName: null,
          sourceDailyLog: null,
        });
        return;
      }
      setDetail(body);
    } finally {
      setDetailLoading(false);
    }
  }

  async function markComplete(id: string) {
    await fetch(`/api/guardian/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    setDetailId(null);
    await load(filter);
  }

  return (
    <div className="simple-home-page mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 sm:py-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            History
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            What happened — notes, meetings, follow-ups, and sources Guardian
            remembers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setTellOpen(true);
            setTellSaved(false);
            setTellAlreadyHad(false);
            setTellError(null);
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden />
          Tell Guardian
        </button>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {HISTORY_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              filter === f
                ? "bg-brand text-white"
                : "bg-stone-100 text-ink-muted hover:bg-stone-200"
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading History…
        </p>
      ) : timeline.length === 0 ? (
        <div className="simple-home-card space-y-3 p-6 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-brand" />
          <p className="font-semibold">Nothing here yet</p>
          <p className="text-sm text-ink-muted">
            Tell Guardian something, or your Daily Logs will show up here as
            History.
          </p>
          <button
            type="button"
            onClick={() => {
              setTellOpen(true);
              setTellSaved(false);
              setTellAlreadyHad(false);
              setTellError(null);
            }}
            className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Tell Guardian something
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {timeline.map((day) => (
            <section key={day.date}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {formatHistoryDayHeading(day.date, today)}
              </h2>
              <ul className="space-y-2">
                {day.events.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => void openDetail(event.id)}
                      className="simple-home-card flex w-full items-start gap-3 p-4 text-left transition hover:bg-stone-50"
                    >
                      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-brand-light text-brand">
                        <EventTypeIcon type={event.eventType} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                          {event.typeLabel}
                          {event.actionRequired && event.status === "open"
                            ? " · Open"
                            : event.status === "completed"
                              ? " · Done"
                              : ""}
                        </span>
                        <span className="mt-0.5 block font-semibold text-foreground">
                          {event.title}
                        </span>
                        {event.summary ? (
                          <span className="mt-1 line-clamp-2 block text-sm text-ink-muted">
                            {event.summary}
                          </span>
                        ) : null}
                        <span className="mt-2 block text-xs text-ink-muted">
                          {event.sourceLabel}
                          {event.spaceId && spaceNames[event.spaceId]
                            ? ` · ${spaceNames[event.spaceId]}`
                            : ""}
                        </span>
                      </span>
                      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-stone-300" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Tell Guardian sheet */}
      {tellOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-labelledby="tell-guardian-title"
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
          >
            {tellSaved ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-700">
                  <Check className="h-5 w-5" />
                  <p className="font-semibold">
                    {tellAlreadyHad
                      ? "Guardian already has that"
                      : "Guardian remembered that"}
                  </p>
                </div>
                <p className="text-sm text-ink-muted">
                  {tellAlreadyHad
                    ? "Same note wasn't added again. It's already in your History."
                    : "It's in your History. You can ask Gideon about it anytime."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={ASK_GIDEON_PATH}
                    className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
                  >
                    Ask Gideon
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setTellSaved(false);
                      setTellAlreadyHad(false);
                      setTellOpen(false);
                    }}
                    className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-semibold hover:bg-stone-50"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2
                      id="tell-guardian-title"
                      className="text-lg font-semibold"
                    >
                      Tell Guardian something
                    </h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      No need to pick a space — Guardian organizes it.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTellOpen(false)}
                    className="rounded-lg p-1 text-ink-muted hover:bg-stone-100"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                {tellError ? (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
                    {tellError}
                  </p>
                ) : null}
                <textarea
                  value={tellText}
                  onChange={(e) => setTellText(e.target.value)}
                  rows={5}
                  placeholder='e.g. "I met Clark today and promised to send him the AI demo next week."'
                  className="w-full rounded-xl border border-border-subtle px-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => void handleTellGuardian()}
                  disabled={telling || !tellText.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                >
                  {telling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save to History
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Event detail */}
      {detailId ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-label="Event details"
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold">Event</h2>
              <button
                type="button"
                onClick={() => setDetailId(null)}
                className="rounded-lg p-1 text-ink-muted hover:bg-stone-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {detailLoading || !detail ? (
              <p className="flex items-center gap-2 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    {detail.card.typeLabel}
                  </p>
                  <p className="mt-1 text-lg font-semibold">{detail.card.title}</p>
                  {detail.card.summary ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">
                      {detail.card.summary}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-xl bg-stone-50 px-4 py-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Source
                  </p>
                  <p className="mt-1 font-medium">{detail.source.label}</p>
                  {detail.spaceName ? (
                    <p className="mt-1 text-ink-muted">Context: {detail.spaceName}</p>
                  ) : (
                    <p className="mt-1 text-ink-muted">
                      Not linked to a space yet — you can classify later.
                    </p>
                  )}
                </div>
                {detail.sourceDailyLog ? (
                  <div className="rounded-xl border border-border-subtle px-4 py-3 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Original Daily Log
                    </p>
                    <p className="mt-1 font-medium">
                      {detail.sourceDailyLog.title || detail.sourceDailyLog.log_date}
                    </p>
                    <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-ink-muted">
                      {detail.sourceDailyLog.content}
                    </p>
                  </div>
                ) : null}
                {detail.card.actionRequired && detail.card.status === "open" ? (
                  <button
                    type="button"
                    onClick={() => void markComplete(detail.card.id)}
                    className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold hover:bg-stone-50"
                  >
                    Mark follow-up done
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
