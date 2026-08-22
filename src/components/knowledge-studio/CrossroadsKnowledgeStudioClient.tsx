"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { formatEasternTimeRange } from "@/lib/knowledge-studio/formatTime";
import {
  canArchive,
  canEdit,
  canHardDelete,
  canPublish,
  canRestore,
  canUnpublish,
  matchesLifecycleFilter,
  previewText,
  type LifecycleFilter,
} from "@/lib/knowledge-studio/lifecycle";
import type {
  KnowledgeEventRow,
  KnowledgeFactRow,
  KnowledgeLifecycle,
} from "@/lib/knowledge-studio/types";

type ScanResult = {
  facts_found: number;
  facts_created: number;
  events_found: number;
  events_created: number;
  skipped_duplicates: number;
  pages_scanned?: string[];
  message?: string;
};

type KnowledgeAction =
  | "publish"
  | "unpublish"
  | "archive"
  | "restore"
  | "delete";

const FILTERS: { id: LifecycleFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "needs_review", label: "Needs Review" },
  { id: "published", label: "Published" },
  { id: "archived", label: "Archived" },
];

function statusBadge(status: KnowledgeLifecycle | string): string {
  const s = String(status).toLowerCase();
  if (s === "published") return "bg-emerald-100 text-emerald-900 border-emerald-300";
  if (s === "needs_review") return "bg-amber-100 text-amber-900 border-amber-300";
  if (s === "archived") return "bg-stone-200 text-stone-700 border-stone-300";
  if (s === "approved") return "bg-violet-50 text-violet-900 border-violet-200";
  return "bg-sky-50 text-sky-900 border-sky-200";
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusBadge(status)}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function formatUpdated(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function LifecycleFilters({
  value,
  onChange,
}: {
  value: LifecycleFilter;
  onChange: (f: LifecycleFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onChange(f.id)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
            value === f.id
              ? "border-brand bg-brand text-white"
              : "border-stone-300 bg-white text-foreground hover:border-brand"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "danger";
}) {
  const classes =
    variant === "primary"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
      : variant === "danger"
        ? "border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
        : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${classes}`}
    >
      {children}
    </button>
  );
}

export default function CrossroadsKnowledgeStudioClient() {
  const [facts, setFacts] = useState<KnowledgeFactRow[]>([]);
  const [events, setEvents] = useState<KnowledgeEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<LifecycleFilter>("all");
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const [manualTitle, setManualTitle] = useState("");
  const [manualStart, setManualStart] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualRsvp, setManualRsvp] = useState("");

  const [factDraft, setFactDraft] = useState({
    category: "",
    title: "",
    content: "",
    source_label: "",
    source_url: "",
  });

  const [eventDraft, setEventDraft] = useState({
    title: "",
    description: "",
    start_at: "",
    end_at: "",
    location: "",
    organizer: "",
    contact: "",
    rsvp_url: "",
    cost: "",
    audience: "",
    source_label: "",
    source_url: "",
  });

  const filteredFacts = useMemo(
    () => facts.filter((f) => matchesLifecycleFilter(f.lifecycle_status, filter)),
    [facts, filter]
  );
  const filteredEvents = useMemo(
    () => events.filter((e) => matchesLifecycleFilter(e.lifecycle_status, filter)),
    [events, filter]
  );

  const loadAll = useCallback(async () => {
    setError(null);
    const [factsRes, eventsRes] = await Promise.all([
      fetch("/api/knowledge-studio/crossroadsconnect/facts"),
      fetch("/api/knowledge-studio/crossroadsconnect/events"),
    ]);
    if (!factsRes.ok || !eventsRes.ok) {
      const body = await (factsRes.ok ? eventsRes : factsRes)
        .json()
        .catch(() => ({}));
      setError(
        typeof body.error === "string"
          ? body.error
          : "Could not load Knowledge Studio data."
      );
      setLoading(false);
      return;
    }
    const factsBody = (await factsRes.json()) as { facts?: KnowledgeFactRow[] };
    const eventsBody = (await eventsRes.json()) as {
      events?: KnowledgeEventRow[];
    };
    setFacts(factsBody.facts ?? []);
    setEvents(eventsBody.events ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function flashSuccess(message: string) {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 6000);
  }

  async function runScan() {
    setScanning(true);
    setError(null);
    setScanResult(null);
    try {
      const res = await fetch(
        "/api/knowledge-studio/crossroadsconnect/scan-website",
        { method: "POST" }
      );
      const body = (await res.json().catch(() => ({}))) as ScanResult & {
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Website scan failed.");
        return;
      }
      setScanResult(body);
      await loadAll();
    } finally {
      setScanning(false);
    }
  }

  async function mutateFact(
    id: string,
    action: KnowledgeAction,
    confirmMessage?: string
  ) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/knowledge-studio/crossroadsconnect/facts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Update failed.");
        return;
      }
      if (body.message) flashSuccess(body.message);
      await loadAll();
    } finally {
      setBusyId(null);
    }
  }

  async function mutateEvent(
    id: string,
    action: KnowledgeAction,
    confirmMessage?: string
  ) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(
        "/api/knowledge-studio/crossroadsconnect/events",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Update failed.");
        return;
      }
      if (body.message) flashSuccess(body.message);
      await loadAll();
    } finally {
      setBusyId(null);
    }
  }

  function startEditFact(fact: KnowledgeFactRow) {
    setEditingFactId(fact.id);
    setEditingEventId(null);
    setFactDraft({
      category: fact.category,
      title: fact.title,
      content: fact.content,
      source_label: fact.source_label ?? "",
      source_url: fact.source_url ?? "",
    });
  }

  function startEditEvent(event: KnowledgeEventRow) {
    setEditingEventId(event.id);
    setEditingFactId(null);
    setEventDraft({
      title: event.title,
      description: event.description ?? "",
      start_at: isoToDatetimeLocal(event.start_at),
      end_at: isoToDatetimeLocal(event.end_at),
      location: event.location ?? "",
      organizer: event.organizer ?? "",
      contact: event.contact ?? "",
      rsvp_url: event.rsvp_url ?? "",
      cost: event.cost ?? "",
      audience: event.audience ?? "",
      source_label: event.source_label ?? "",
      source_url: event.source_url ?? "",
    });
  }

  async function saveFactEdit(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/knowledge-studio/crossroadsconnect/facts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action: "edit",
          ...factDraft,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Save failed.");
        return;
      }
      setEditingFactId(null);
      if (body.message) flashSuccess(body.message);
      await loadAll();
    } finally {
      setBusyId(null);
    }
  }

  async function saveEventEdit(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(
        "/api/knowledge-studio/crossroadsconnect/events",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            action: "edit",
            title: eventDraft.title,
            description: eventDraft.description || null,
            start_at: datetimeLocalToIso(eventDraft.start_at),
            end_at: datetimeLocalToIso(eventDraft.end_at),
            location: eventDraft.location || null,
            organizer: eventDraft.organizer || null,
            contact: eventDraft.contact || null,
            rsvp_url: eventDraft.rsvp_url || null,
            cost: eventDraft.cost || null,
            audience: eventDraft.audience || null,
            source_label: eventDraft.source_label || null,
            source_url: eventDraft.source_url || null,
          }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Save failed.");
        return;
      }
      setEditingEventId(null);
      if (body.message) flashSuccess(body.message);
      await loadAll();
    } finally {
      setBusyId(null);
    }
  }

  async function createManualEvent(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/knowledge-studio/crossroadsconnect/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: manualTitle,
        start_at: datetimeLocalToIso(manualStart),
        location: manualLocation,
        description: manualDescription,
        rsvp_url: manualRsvp,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(body.error ?? "Could not create event.");
      return;
    }
    setManualTitle("");
    setManualStart("");
    setManualLocation("");
    setManualDescription("");
    setManualRsvp("");
    flashSuccess("Draft event saved.");
    await loadAll();
  }

  function archiveConfirmMessage(status: KnowledgeLifecycle): string {
    if (status === "published") {
      return "Archive this published knowledge?\n\nIt will be removed from the public assistant but retained in Knowledge Studio history.";
    }
    return "Archive this knowledge?";
  }

  return (
    <div className="space-y-10">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {success}
        </p>
      ) : null}

      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Website Source
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            CrossRoads Connect Website
          </p>
          <a
            href="https://www.crossroadsconnect.us/"
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-sm font-medium text-brand hover:underline"
          >
            https://www.crossroadsconnect.us/
          </a>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-muted">Status</dt>
            <dd className="font-medium text-foreground">Trusted source</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Pages</dt>
            <dd className="font-medium text-foreground">Homepage · Events</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={() => void runScan()}
          disabled={scanning}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {scanning ? "Scanning CrossRoads Connect…" : "Scan website"}
        </button>
        {scanResult ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
            <p className="font-semibold">Website scan complete</p>
            <p className="mt-1">
              {scanResult.facts_created} new knowledge fact
              {scanResult.facts_created === 1 ? "" : "s"}
              {" · "}
              {scanResult.events_created} event
              {scanResult.events_created === 1 ? "" : "s"} created
              {" · "}
              {scanResult.skipped_duplicates} duplicate
              {scanResult.skipped_duplicates === 1 ? "" : "s"} skipped
            </p>
            <p className="mt-2 text-emerald-900/80">
              Review everything below before publishing. Scans never overwrite
              existing knowledge.
            </p>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            Organization Knowledge
          </h2>
          <LifecycleFilters value={filter} onChange={setFilter} />
        </div>
        {loading ? (
          <p className="text-sm text-ink-muted">Loading facts…</p>
        ) : filteredFacts.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No organization facts in this filter.
          </p>
        ) : (
          <ul className="space-y-3">
            {filteredFacts.map((fact) => (
              <li
                key={fact.id}
                className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                      {fact.category}
                    </p>
                    <h3 className="text-base font-semibold text-foreground">
                      {fact.title}
                    </h3>
                  </div>
                  <StatusPill status={fact.lifecycle_status} />
                </div>
                {editingFactId === fact.id ? (
                  <div className="mt-3 space-y-2">
                    <input
                      value={factDraft.category}
                      onChange={(e) =>
                        setFactDraft((d) => ({ ...d, category: e.target.value }))
                      }
                      placeholder="Category"
                      className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                    />
                    <input
                      value={factDraft.title}
                      onChange={(e) =>
                        setFactDraft((d) => ({ ...d, title: e.target.value }))
                      }
                      placeholder="Title"
                      className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                    />
                    <textarea
                      value={factDraft.content}
                      onChange={(e) =>
                        setFactDraft((d) => ({ ...d, content: e.target.value }))
                      }
                      rows={4}
                      placeholder="Content"
                      className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                    />
                    <input
                      value={factDraft.source_label}
                      onChange={(e) =>
                        setFactDraft((d) => ({
                          ...d,
                          source_label: e.target.value,
                        }))
                      }
                      placeholder="Source label"
                      className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                    />
                    <input
                      value={factDraft.source_url}
                      onChange={(e) =>
                        setFactDraft((d) => ({
                          ...d,
                          source_url: e.target.value,
                        }))
                      }
                      placeholder="Source URL"
                      className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        variant="primary"
                        disabled={busyId === fact.id}
                        onClick={() => void saveFactEdit(fact.id)}
                      >
                        Save
                      </ActionButton>
                      <ActionButton onClick={() => setEditingFactId(null)}>
                        Cancel
                      </ActionButton>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
                      {previewText(fact.content)}
                    </p>
                    <p className="mt-2 text-xs text-ink-muted">
                      Source:{" "}
                      {fact.source_url ? (
                        <a
                          href={fact.source_url}
                          className="text-brand hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {fact.source_label ?? fact.source_url}
                        </a>
                      ) : (
                        fact.source_label ?? "—"
                      )}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Updated {formatUpdated(fact.updated_at)}
                    </p>
                  </>
                )}
                {editingFactId !== fact.id ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canEdit(fact.lifecycle_status) ? (
                      <ActionButton onClick={() => startEditFact(fact)}>
                        Edit
                      </ActionButton>
                    ) : null}
                    {canPublish(fact.lifecycle_status) ? (
                      <ActionButton
                        variant="primary"
                        disabled={busyId === fact.id}
                        onClick={() => void mutateFact(fact.id, "publish")}
                      >
                        Publish public
                      </ActionButton>
                    ) : null}
                    {canUnpublish(fact.lifecycle_status) ? (
                      <ActionButton
                        disabled={busyId === fact.id}
                        onClick={() =>
                          void mutateFact(
                            fact.id,
                            "unpublish",
                            "Unpublish this knowledge?\n\nAttendees will no longer be able to access this information through the public Crossroads Connect assistant."
                          )
                        }
                      >
                        Unpublish
                      </ActionButton>
                    ) : null}
                    {canArchive(fact.lifecycle_status) ? (
                      <ActionButton
                        disabled={busyId === fact.id}
                        onClick={() =>
                          void mutateFact(
                            fact.id,
                            "archive",
                            archiveConfirmMessage(fact.lifecycle_status)
                          )
                        }
                      >
                        Archive
                      </ActionButton>
                    ) : null}
                    {canRestore(fact.lifecycle_status) ? (
                      <ActionButton
                        variant="primary"
                        disabled={busyId === fact.id}
                        onClick={() => void mutateFact(fact.id, "restore")}
                      >
                        Restore
                      </ActionButton>
                    ) : null}
                    {canHardDelete(fact) ? (
                      <ActionButton
                        variant="danger"
                        disabled={busyId === fact.id}
                        onClick={() =>
                          void mutateFact(
                            fact.id,
                            "delete",
                            "Delete this draft permanently?"
                          )
                        }
                      >
                        Delete draft
                      </ActionButton>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Events</h2>
        <form
          onSubmit={(e) => void createManualEvent(e)}
          className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
        >
          <p className="text-sm font-medium text-foreground">
            Manual event entry
          </p>
          <input
            required
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            placeholder="Event title"
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
          />
          <input
            type="datetime-local"
            value={manualStart}
            onChange={(e) => setManualStart(e.target.value)}
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
          />
          <input
            value={manualLocation}
            onChange={(e) => setManualLocation(e.target.value)}
            placeholder="Location"
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
          />
          <input
            value={manualRsvp}
            onChange={(e) => setManualRsvp(e.target.value)}
            placeholder="RSVP URL"
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
          />
          <textarea
            value={manualDescription}
            onChange={(e) => setManualDescription(e.target.value)}
            placeholder="Description"
            rows={3}
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg border border-stone-300 bg-stone-50 px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-100"
          >
            Save draft event
          </button>
        </form>

        {loading ? (
          <p className="text-sm text-ink-muted">Loading events…</p>
        ) : filteredEvents.length === 0 ? (
          <p className="text-sm text-ink-muted">No events in this filter.</p>
        ) : (
          <ul className="space-y-3">
            {filteredEvents.map((event) => {
              const when = formatEasternTimeRange(event.start_at, event.end_at);
              return (
                <li
                  key={event.id}
                  className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-foreground">
                      {event.title}
                    </h3>
                    <StatusPill status={event.lifecycle_status} />
                  </div>
                  {editingEventId === event.id ? (
                    <div className="mt-3 space-y-2">
                      <input
                        value={eventDraft.title}
                        onChange={(e) =>
                          setEventDraft((d) => ({ ...d, title: e.target.value }))
                        }
                        placeholder="Title"
                        className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                      />
                      <textarea
                        value={eventDraft.description}
                        onChange={(e) =>
                          setEventDraft((d) => ({
                            ...d,
                            description: e.target.value,
                          }))
                        }
                        rows={3}
                        placeholder="Description"
                        className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="datetime-local"
                        value={eventDraft.start_at}
                        onChange={(e) =>
                          setEventDraft((d) => ({
                            ...d,
                            start_at: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="datetime-local"
                        value={eventDraft.end_at}
                        onChange={(e) =>
                          setEventDraft((d) => ({
                            ...d,
                            end_at: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                      />
                      <input
                        value={eventDraft.location}
                        onChange={(e) =>
                          setEventDraft((d) => ({
                            ...d,
                            location: e.target.value,
                          }))
                        }
                        placeholder="Location"
                        className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                      />
                      <input
                        value={eventDraft.organizer}
                        onChange={(e) =>
                          setEventDraft((d) => ({
                            ...d,
                            organizer: e.target.value,
                          }))
                        }
                        placeholder="Organizer / speaker"
                        className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                      />
                      <input
                        value={eventDraft.contact}
                        onChange={(e) =>
                          setEventDraft((d) => ({
                            ...d,
                            contact: e.target.value,
                          }))
                        }
                        placeholder="Contact"
                        className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                      />
                      <input
                        value={eventDraft.rsvp_url}
                        onChange={(e) =>
                          setEventDraft((d) => ({
                            ...d,
                            rsvp_url: e.target.value,
                          }))
                        }
                        placeholder="RSVP URL"
                        className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                      />
                      <input
                        value={eventDraft.cost}
                        onChange={(e) =>
                          setEventDraft((d) => ({ ...d, cost: e.target.value }))
                        }
                        placeholder="Cost"
                        className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                      />
                      <input
                        value={eventDraft.audience}
                        onChange={(e) =>
                          setEventDraft((d) => ({
                            ...d,
                            audience: e.target.value,
                          }))
                        }
                        placeholder="Audience"
                        className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                      />
                      <input
                        value={eventDraft.source_label}
                        onChange={(e) =>
                          setEventDraft((d) => ({
                            ...d,
                            source_label: e.target.value,
                          }))
                        }
                        placeholder="Source label"
                        className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                      />
                      <input
                        value={eventDraft.source_url}
                        onChange={(e) =>
                          setEventDraft((d) => ({
                            ...d,
                            source_url: e.target.value,
                          }))
                        }
                        placeholder="Source URL"
                        className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        <ActionButton
                          variant="primary"
                          disabled={busyId === event.id}
                          onClick={() => void saveEventEdit(event.id)}
                        >
                          Save
                        </ActionButton>
                        <ActionButton onClick={() => setEditingEventId(null)}>
                          Cancel
                        </ActionButton>
                      </div>
                    </div>
                  ) : (
                    <>
                      {event.description ? (
                        <p className="mt-2 text-sm text-foreground/90">
                          {previewText(event.description)}
                        </p>
                      ) : null}
                      <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                        {when ? <li>When: {when}</li> : null}
                        {event.location ? (
                          <li>Location: {event.location}</li>
                        ) : null}
                        {event.organizer ? (
                          <li>Organizer: {event.organizer}</li>
                        ) : null}
                        {event.cost ? <li>Cost: {event.cost}</li> : null}
                        {event.rsvp_url ? (
                          <li>
                            RSVP:{" "}
                            <a
                              href={event.rsvp_url}
                              className="text-brand hover:underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {event.rsvp_url}
                            </a>
                          </li>
                        ) : null}
                        <li>
                          Source: {event.source_label ?? "—"}
                          {event.source_url ? ` — ${event.source_url}` : ""}
                        </li>
                        <li>Updated {formatUpdated(event.updated_at)}</li>
                      </ul>
                    </>
                  )}
                  {editingEventId !== event.id ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canEdit(event.lifecycle_status) ? (
                        <ActionButton onClick={() => startEditEvent(event)}>
                          Edit
                        </ActionButton>
                      ) : null}
                      {canPublish(event.lifecycle_status) ? (
                        <ActionButton
                          variant="primary"
                          disabled={busyId === event.id}
                          onClick={() => void mutateEvent(event.id, "publish")}
                        >
                          Publish public
                        </ActionButton>
                      ) : null}
                      {canUnpublish(event.lifecycle_status) ? (
                        <ActionButton
                          disabled={busyId === event.id}
                          onClick={() =>
                            void mutateEvent(
                              event.id,
                              "unpublish",
                              "Unpublish this knowledge?\n\nAttendees will no longer be able to access this information through the public Crossroads Connect assistant."
                            )
                          }
                        >
                          Unpublish
                        </ActionButton>
                      ) : null}
                      {canArchive(event.lifecycle_status) ? (
                        <ActionButton
                          disabled={busyId === event.id}
                          onClick={() =>
                            void mutateEvent(
                              event.id,
                              "archive",
                              archiveConfirmMessage(event.lifecycle_status)
                            )
                          }
                        >
                          Archive
                        </ActionButton>
                      ) : null}
                      {canRestore(event.lifecycle_status) ? (
                        <ActionButton
                          variant="primary"
                          disabled={busyId === event.id}
                          onClick={() => void mutateEvent(event.id, "restore")}
                        >
                          Restore
                        </ActionButton>
                      ) : null}
                      {canHardDelete(event) ? (
                        <ActionButton
                          variant="danger"
                          disabled={busyId === event.id}
                          onClick={() =>
                            void mutateEvent(
                              event.id,
                              "delete",
                              "Delete this draft permanently?"
                            )
                          }
                        >
                          Delete draft
                        </ActionButton>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
