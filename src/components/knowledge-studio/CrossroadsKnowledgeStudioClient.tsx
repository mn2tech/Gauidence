"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
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

function statusBadge(status: KnowledgeLifecycle | string): string {
  const s = String(status).toLowerCase();
  if (s === "published") return "bg-emerald-100 text-emerald-900 border-emerald-300";
  if (s === "needs_review") return "bg-amber-100 text-amber-900 border-amber-300";
  if (s === "archived") return "bg-stone-200 text-stone-700 border-stone-300";
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

export default function CrossroadsKnowledgeStudioClient() {
  const [facts, setFacts] = useState<KnowledgeFactRow[]>([]);
  const [events, setEvents] = useState<KnowledgeEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [manualTitle, setManualTitle] = useState("");
  const [manualStart, setManualStart] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualRsvp, setManualRsvp] = useState("");

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

  async function patchFact(id: string, action: "publish" | "archive") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(
        "/api/knowledge-studio/crossroadsconnect/facts",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Update failed.");
        return;
      }
      await loadAll();
    } finally {
      setBusyId(null);
    }
  }

  async function patchEvent(id: string, action: "publish" | "archive") {
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
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Update failed.");
        return;
      }
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
        start_at: manualStart || null,
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
    await loadAll();
  }

  return (
    <div className="space-y-10">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
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
            <dd className="font-medium text-foreground">
              Homepage · Events
            </dd>
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
              Review everything below before publishing.
            </p>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          Organization Knowledge
        </h2>
        {loading ? (
          <p className="text-sm text-ink-muted">Loading facts…</p>
        ) : facts.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No organization facts yet. Scan the website or wait for extraction
            results.
          </p>
        ) : (
          <ul className="space-y-3">
            {facts.map((fact) => (
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
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
                  {fact.content}
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
                <div className="mt-3 flex flex-wrap gap-2">
                  {fact.lifecycle_status !== "published" ? (
                    <button
                      type="button"
                      disabled={busyId === fact.id}
                      onClick={() => void patchFact(fact.id, "publish")}
                      className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      Publish public
                    </button>
                  ) : null}
                  {fact.lifecycle_status !== "archived" ? (
                    <button
                      type="button"
                      disabled={busyId === fact.id}
                      onClick={() => void patchFact(fact.id, "archive")}
                      className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                    >
                      Archive
                    </button>
                  ) : null}
                </div>
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
        ) : events.length === 0 ? (
          <p className="text-sm text-ink-muted">No events yet.</p>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => (
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
                {event.description ? (
                  <p className="mt-2 text-sm text-foreground/90">
                    {event.description}
                  </p>
                ) : null}
                <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                  {event.start_at ? <li>Starts: {event.start_at}</li> : null}
                  {event.location ? <li>Location: {event.location}</li> : null}
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
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  {event.lifecycle_status !== "published" ? (
                    <button
                      type="button"
                      disabled={busyId === event.id}
                      onClick={() => void patchEvent(event.id, "publish")}
                      className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      Publish public
                    </button>
                  ) : null}
                  {event.lifecycle_status !== "archived" ? (
                    <button
                      type="button"
                      disabled={busyId === event.id}
                      onClick={() => void patchEvent(event.id, "archive")}
                      className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                    >
                      Archive
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
