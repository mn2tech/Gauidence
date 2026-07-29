"use client";

import { useState, type FormEvent } from "react";
import { FileText, Loader2 } from "lucide-react";
import { todayLogDate } from "@/lib/logs/types";

type Props = {
  profileId: string;
};

export default function EmployeeStatusPanel({ profileId }: Props) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          logDate: todayLogDate(),
          title: "Status report",
          content: content.trim(),
          category: "Status Report",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't save status.");
      setContent("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
          <FileText className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight">Status report</h2>
          <p className="text-xs text-ink-muted">Quick daily update for your manager</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="What did you work on today?"
          className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
        />
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="text-sm text-emerald-700">Status saved for today.</p>
        ) : null}
        <button
          type="submit"
          disabled={busy || !content.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Submit status
        </button>
      </form>
    </div>
  );
}
