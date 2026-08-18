"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { LeadContact } from "@/lib/leads/types";

const inputClass =
  "w-full rounded-xl border border-border-subtle px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

type Props = {
  leadId: string;
  contacts: LeadContact[];
  onChanged: () => Promise<void> | void;
};

export default function LeadContactsPanel({ leadId, contacts, onChanged }: Props) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [primary, setPrimary] = useState(contacts.length === 0);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter a contact name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: name.trim(),
          jobTitle: title.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          isPrimary: primary,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't add contact.");
      setName("");
      setTitle("");
      setEmail("");
      setPhone("");
      setPrimary(false);
      setAdding(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add contact.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Contacts</h2>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-sm font-medium text-brand hover:underline"
        >
          {adding ? "Cancel" : "Add contact"}
        </button>
      </div>

      {contacts.length === 0 && !adding ? (
        <p className="mt-3 text-sm text-ink-muted">
          No additional contacts yet. The primary person stays on this company.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {contacts.map((c) => (
            <li key={c.id} className="text-sm">
              <p className="font-medium">
                {c.full_name}
                {c.is_primary ? (
                  <span className="ml-2 text-xs font-normal text-ink-muted">
                    Primary
                  </span>
                ) : null}
              </p>
              <p className="text-ink-muted">
                {[c.job_title, c.email, c.phone].filter(Boolean).join(" · ") || "—"}
              </p>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form onSubmit={(e) => void handleAdd(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className={inputClass}
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className={inputClass}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className={inputClass}
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
            className={inputClass}
          />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={primary}
              onChange={(e) => setPrimary(e.target.checked)}
            />
            Primary relationship
          </label>
          {error ? <p className="text-sm text-red-600 sm:col-span-2">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save contact
          </button>
        </form>
      ) : null}
    </div>
  );
}
