"use client";

import { useState } from "react";
import { formatParentDate } from "@/lib/mcps-parent/display";
import type { ScoredParentItem } from "@/lib/mcps-parent/types";

export default function WhatMattersCard({
  item,
  schoolName,
}: {
  item: ScoredParentItem;
  schoolName: string;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [offset, setOffset] = useState("1_day");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveReminder() {
    if (!item.event_date) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/mcps-parent/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          knowledge_item_id: item.id,
          event_date: item.event_date,
          offset,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setNote(body.error ?? "Could not save reminder.");
        return;
      }
      setNote("Reminder saved.");
      setRemindOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function addToCalendar() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/mcps-parent/calendar/${item.id}`);
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        google_url?: string;
        ics?: string;
        filename?: string;
      };
      if (!res.ok) {
        setNote(body.error ?? "Calendar event unavailable.");
        return;
      }
      if (body.google_url) {
        window.open(body.google_url, "_blank", "noopener,noreferrer");
      }
      if (body.ics && body.filename) {
        const blob = new Blob([body.ics], { type: "text/calendar;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = body.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      setNote("Calendar event ready.");
    } finally {
      setBusy(false);
    }
  }

  const why =
    item.reasons[0] ??
    (item.school ? `Applies to ${schoolName}` : "District-wide");

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      {item.event_date ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {formatParentDate(item.event_date)}
        </p>
      ) : null}
      <h3 className="mt-1 text-lg font-semibold text-foreground">{item.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-foreground/90">
        {item.summary}
      </p>
      <p className="mt-3 text-xs text-ink-muted">
        Why you&apos;re seeing this: {why}
      </p>
      {item.stale ? (
        <p className="mt-2 text-xs text-amber-800">
          Please verify with MCPS — this source may need a refresh.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-semibold hover:bg-stone-50"
        >
          Details
        </button>
        {item.event_date ? (
          <>
            <button
              type="button"
              onClick={() => setRemindOpen((v) => !v)}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-semibold hover:bg-stone-50"
            >
              Remind Me
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void addToCalendar()}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-semibold hover:bg-stone-50 disabled:opacity-60"
            >
              Add to Calendar
            </button>
          </>
        ) : null}
      </div>

      {remindOpen ? (
        <div className="mt-3 space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
          <p className="text-xs font-medium">Remind me:</p>
          {[
            { value: "1_day", label: "1 day before" },
            { value: "2_days", label: "2 days before" },
            { value: "1_week", label: "1 week before" },
          ].map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`remind-${item.id}`}
                checked={offset === opt.value}
                onChange={() => setOffset(opt.value)}
              />
              {opt.label}
            </label>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveReminder()}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            Save Reminder
          </button>
        </div>
      ) : null}

      {showDetails ? (
        <div className="mt-3 space-y-1 rounded-lg border border-stone-100 bg-stone-50 p-3 text-xs text-ink-muted">
          <p>
            Source: {item.authority ?? "Montgomery County Public Schools"}
          </p>
          <p>Last checked: {item.last_checked_at
            ? new Date(item.last_checked_at).toLocaleDateString()
            : "—"}</p>
          {item.source_url ? (
            <a
              href={item.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-brand hover:underline"
            >
              View Source
            </a>
          ) : null}
        </div>
      ) : null}

      {note ? (
        <p className="mt-2 text-xs text-emerald-800">{note}</p>
      ) : null}
    </article>
  );
}
