"use client";

import { useState } from "react";
import { renderGideonText } from "@/components/gideonText";

const STARTERS = [
  "What is CrossRoads Connect?",
  "What programs do you offer?",
  "What is the next event?",
  "How do I RSVP?",
];

export default function CrossroadsPublicAskClient() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/public/crossroadsconnect/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not answer right now.");
        return;
      }
      setAnswer(body.answer ?? null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="space-y-3"
      >
        <label htmlFor="crc-ask" className="sr-only">
          Ask about CrossRoads Connect
        </label>
        <textarea
          id="crc-ask"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="Ask about CrossRoads Connect…"
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? "Searching…" : "Ask Gideon"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {STARTERS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={loading}
            onClick={() => {
              setQuestion(s);
              void ask(s);
            }}
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:border-brand"
          >
            {s}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {answer ? (
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm whitespace-pre-wrap text-foreground shadow-sm">
          {renderGideonText(answer)}
        </div>
      ) : null}
    </div>
  );
}
