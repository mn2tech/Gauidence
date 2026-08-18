"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { LeadOpportunityLink } from "@/lib/leads/types";

const inputClass =
  "w-full rounded-xl border border-border-subtle px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

type Props = {
  leadId: string;
  opportunities: LeadOpportunityLink[];
  onChanged: () => Promise<void> | void;
};

export default function LeadOpportunitiesPanel({
  leadId,
  opportunities,
  onChanged,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [agency, setAgency] = useState("");
  const [notes, setNotes] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Enter an opportunity title.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/opportunities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          agency: agency.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't add opportunity.");
      setTitle("");
      setAgency("");
      setNotes("");
      setAdding(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add opportunity.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Opportunities</h2>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-sm font-medium text-brand hover:underline"
        >
          {adding ? "Cancel" : "Link opportunity"}
        </button>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        A partner can connect to more than one opportunity. This does not send
        outreach.
      </p>

      {opportunities.length === 0 && !adding ? (
        <p className="mt-3 text-sm text-ink-muted">
          No linked opportunities yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {opportunities.map((o) => (
            <li key={o.id} className="text-sm">
              <p className="font-medium">{o.title}</p>
              <p className="text-ink-muted">
                {[o.agency, o.status.replace(/_/g, " "), o.notes]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form onSubmit={(e) => void handleAdd(e)} className="mt-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Opportunity title"
            className={inputClass}
          />
          <input
            value={agency}
            onChange={(e) => setAgency(e.target.value)}
            placeholder="Agency (optional)"
            className={inputClass}
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className={inputClass}
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save opportunity
          </button>
        </form>
      ) : null}
    </div>
  );
}
