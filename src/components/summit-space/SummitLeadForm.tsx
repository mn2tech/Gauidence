"use client";

import { FormEvent, useState } from "react";

type Props = {
  summitSlug: string;
};

export default function SummitLeadForm({ summitSlug }: Props) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [showForm, setShowForm] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    const res = await fetch(`/api/public/summit/${summitSlug}/leads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, company, email }),
    });
    if (res.ok) {
      setStatus("done");
      setName("");
      setCompany("");
      setEmail("");
    } else {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-brand/30 bg-brand-light/30 p-6 text-center">
        <p className="font-semibold">Thank you!</p>
        <p className="mt-1 text-sm text-ink-muted">
          We&apos;ll be in touch about creating your Guardian intelligence space.
        </p>
      </div>
    );
  }

  if (!showForm) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
        <p className="font-semibold">Want your own Guardian intelligence space?</p>
        <p className="mt-1 text-sm text-ink-muted">
          Turn your events, clients, and knowledge into an AI-powered hub like
          this one.
        </p>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-4 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Create My Guardian Space
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-stone-200 bg-white p-6"
    >
      <p className="font-semibold">Want your own Guardian intelligence space?</p>
      <div className="mt-4 space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          required
          className="w-full rounded-xl border border-stone-200 p-3 text-base"
        />
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company"
          className="w-full rounded-xl border border-stone-200 p-3 text-base"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Email"
          required
          className="w-full rounded-xl border border-stone-200 p-3 text-base"
        />
      </div>
      {status === "error" ? (
        <p className="mt-2 text-sm text-rose-600">
          Could not save — please try again.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status === "loading"}
        className="mt-4 w-full rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {status === "loading" ? "Submitting…" : "Create My Guardian Space"}
      </button>
    </form>
  );
}
