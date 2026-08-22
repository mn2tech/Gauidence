"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type EventRow = { id:string; title:string; start_at:string; location:string|null; lifecycle_status:string; visibility:string; rsvp_url:string|null };

export default function EventStudio() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/knowledge-studio/events", { cache: "no-store" });
    const json = await res.json();
    if (res.ok) setEvents(json.events ?? []); else setMessage(json.error ?? "Could not load events");
  }
  useEffect(() => { void load(); }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true); setMessage("");
    const fd = new FormData(e.currentTarget);
    const startLocal = String(fd.get("start_at") || "");
    const body = Object.fromEntries(fd.entries());
    body.start_at = new Date(startLocal).toISOString();
    const res = await fetch("/api/knowledge-studio/events", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body) });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setMessage(json.error ?? "Could not save event"); return; }
    e.currentTarget.reset(); setMessage("Draft saved. Review it below, then publish when ready."); void load();
  }

  async function publish(id:string) {
    setMessage("");
    const res = await fetch("/api/knowledge-studio/events", { method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({ id, lifecycle_status:"published", visibility:"public" }) });
    const json = await res.json();
    if (!res.ok) { setMessage(json.error ?? "Could not publish event"); return; }
    setMessage("Published. Attendees can now ask the public Crossroads assistant about this event."); void load();
  }

  return <div className="space-y-8">
    <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">1. Add trusted event knowledge</h2>
      <p className="mt-1 text-sm text-ink-muted">For the first test, enter the flyer details here. Automated flyer extraction can plug into this same review queue next.</p>
      <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm">Event title<input required name="title" className="mt-1 w-full rounded-xl border p-3" /></label>
        <label className="text-sm">Date & time<input required type="datetime-local" name="start_at" className="mt-1 w-full rounded-xl border p-3" /></label>
        <label className="text-sm md:col-span-2">Description<textarea name="description" rows={3} className="mt-1 w-full rounded-xl border p-3" /></label>
        <label className="text-sm">Location<input name="location" className="mt-1 w-full rounded-xl border p-3" /></label>
        <label className="text-sm">RSVP link<input name="rsvp_url" placeholder="https://..." className="mt-1 w-full rounded-xl border p-3" /></label>
        <label className="text-sm">Contact<input name="contact" className="mt-1 w-full rounded-xl border p-3" /></label>
        <label className="text-sm">Cost<input name="cost" placeholder="Free / $25 / ..." className="mt-1 w-full rounded-xl border p-3" /></label>
        <label className="text-sm">Audience<input name="audience" className="mt-1 w-full rounded-xl border p-3" /></label>
        <label className="text-sm">Source<input name="source_label" placeholder="Event flyer" className="mt-1 w-full rounded-xl border p-3" /></label>
        <button disabled={saving} className="rounded-xl bg-black px-5 py-3 text-sm font-medium text-white md:col-span-2">{saving ? "Saving…" : "Save as draft"}</button>
      </form>
    </section>

    <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">2. Review & publish</h2><p className="text-sm text-ink-muted">Only published + public rows are visible to attendees.</p></div><Link href="/crossroadsconnect" target="_blank" className="rounded-xl border px-4 py-2 text-sm font-medium">Open attendee view</Link></div>
      {message && <p className="mt-4 rounded-xl bg-black/5 p-3 text-sm">{message}</p>}
      <div className="mt-5 space-y-3">{events.length === 0 ? <p className="text-sm text-ink-muted">No event knowledge yet.</p> : events.map(event => <div key={event.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4"><div><div className="font-medium">{event.title}</div><div className="text-sm text-ink-muted">{new Date(event.start_at).toLocaleString()} {event.location ? `• ${event.location}` : ""}</div><div className="mt-1 text-xs uppercase tracking-wide text-ink-muted">{event.lifecycle_status} • {event.visibility}</div></div>{event.lifecycle_status !== "published" && <button onClick={() => publish(event.id)} className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white">Publish public</button>}</div>)}</div>
    </section>
  </div>;
}
