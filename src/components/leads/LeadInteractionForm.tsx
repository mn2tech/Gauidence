"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  LEAD_ACTIVITY_LABELS,
  type LeadActivityType,
  type LeadContact,
} from "@/lib/leads/types";

const inputClass =
  "w-full rounded-xl border border-border-subtle px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

const LOG_TYPES: LeadActivityType[] = [
  "note",
  "email_sent",
  "email_received",
  "phone_call",
  "meeting",
  "networking_event",
  "linkedin",
  "capability_statement",
  "proposal_sent",
  "teaming_discussion",
  "opportunity_discussion",
  "follow_up",
  "contacted",
];

type Props = {
  leadId: string;
  contacts: LeadContact[];
  onLogged: () => Promise<void> | void;
};

export default function LeadInteractionForm({ leadId, contacts, onLogged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<LeadActivityType>("note");
  const [summary, setSummary] = useState("");
  const [contactId, setContactId] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!summary.trim()) {
      setError("Add a short summary.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityType: type,
          description: summary.trim(),
          contactId: contactId || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't log activity.");
      setSummary("");
      await onLogged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't log activity.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as LeadActivityType)}
        className={inputClass}
      >
        {LOG_TYPES.map((t) => (
          <option key={t} value={t}>
            {LEAD_ACTIVITY_LABELS[t]}
          </option>
        ))}
      </select>
      <select
        value={contactId}
        onChange={(e) => setContactId(e.target.value)}
        className={inputClass}
      >
        <option value="">Contact (optional)</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.full_name}
          </option>
        ))}
      </select>
      <input
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="What happened?"
        className={`sm:col-span-2 ${inputClass}`}
      />
      {error ? <p className="text-sm text-red-600 sm:col-span-2">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Log interaction
      </button>
    </form>
  );
}
