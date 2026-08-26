"use client";

import { useState, type FormEvent } from "react";

type AskResult = {
  answer: string;
  sources_used: Array<{
    id: string;
    title: string;
    source_name: string;
    source_url: string | null;
  }>;
};

export default function AskMySchoolPanel({
  suggestedQuestions,
  activeView = "all",
  familyMode = false,
}: {
  suggestedQuestions: string[];
  activeView?: string;
  familyMode?: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);

  async function ask(q: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/mcps-parent/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, view: activeView }),
      });
      const body = (await res.json().catch(() => ({}))) as AskResult & {
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Ask Gideon failed.");
        return;
      }
      setResult(body);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    void ask(question.trim());
  }

  return (
    <section
      id="ask-gideon"
      className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
    >
      <div>
        <h2 className="text-lg font-semibold">
          {familyMode ? "Ask Gideon — My Family" : "Ask Gideon — My School"}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {familyMode
            ? "Gideon can answer across all of your children’s schools."
            : "Gideon already knows this school and grade."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {suggestedQuestions.map((q) => (
          <button
            key={q}
            type="button"
            disabled={busy}
            onClick={() => {
              setQuestion(q);
              void ask(q);
            }}
            className="rounded-md border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs font-medium hover:bg-stone-100 disabled:opacity-60"
          >
            {q}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            familyMode
              ? "What does my family need to know this week?"
              : "What do I need to know this week?"
          }
          className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? "Asking…" : "Ask Gideon"}
        </button>
      </form>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="space-y-3 border-t border-stone-100 pt-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {result.answer}
          </p>
          {result.sources_used.length > 0 ? (
            <details className="text-xs text-ink-muted">
              <summary className="cursor-pointer font-medium">
                View sources
              </summary>
              <ul className="mt-2 space-y-1">
                {result.sources_used.map((s) => (
                  <li key={s.id}>
                    {s.source_url ? (
                      <a
                        href={s.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand hover:underline"
                      >
                        {s.title}
                      </a>
                    ) : (
                      s.title
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
