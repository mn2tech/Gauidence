"use client";

import { useState, type FormEvent } from "react";
import { NO_VERIFIED_MCPS_ANSWER } from "@/lib/knowledge-studio/projects/constants";

type AskResult = {
  answer: string;
  usedKnowledge: boolean;
  sources_used: Array<{
    id: string;
    title: string;
    source_name: string;
    source_url: string | null;
    authority: string | null;
    category: string;
  }>;
  retrieval: Array<{
    source: string;
    category: string;
    relevance: number;
    publication_status: string;
    title: string;
  }>;
};

const SAMPLE_QUESTIONS = [
  "Is there school next Monday?",
  "How do I find my child's assigned school?",
  "Who should I contact about transportation?",
  "How do I register a student?",
  "What is ParentVUE?",
  "Where can parents get help?",
];

export default function TestGideonPanel({
  projectSlug,
}: {
  projectSlug: string;
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
      const res = await fetch(
        `/api/knowledge-studio/projects/${projectSlug}/ask`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as AskResult & {
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Test Gideon failed.");
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
    <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Test Gideon</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Answers use only published knowledge from this project. Citations are
          required.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={busy}
            onClick={() => {
              setQuestion(q);
              void ask(q);
            }}
            className="rounded-md border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-stone-100 disabled:opacity-60"
          >
            {q}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a parent question…"
          className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? "Asking…" : "Ask"}
        </button>
      </form>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="space-y-4 border-t border-stone-100 pt-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Answer
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
              {result.answer || NO_VERIFIED_MCPS_ANSWER}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Sources Used
            </h3>
            {result.sources_used.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">None</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {result.sources_used.map((s) => (
                  <li key={s.id} className="rounded-md border border-stone-200 p-3">
                    <p className="font-medium">{s.title}</p>
                    <p className="text-xs text-ink-muted">
                      {s.authority ?? "—"} · {s.source_name} · {s.category}
                    </p>
                    {s.source_url ? (
                      <a
                        href={s.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-brand hover:underline"
                      >
                        {s.source_url}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Retrieval Information
            </h3>
            <p className="mt-1 text-xs text-ink-muted">Admin only</p>
            {result.retrieval.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">No published hits.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="text-ink-muted">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Title</th>
                      <th className="py-1 pr-3 font-medium">Source</th>
                      <th className="py-1 pr-3 font-medium">Category</th>
                      <th className="py-1 pr-3 font-medium">Relevance</th>
                      <th className="py-1 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.retrieval.map((r, i) => (
                      <tr key={`${r.title}-${i}`} className="border-t border-stone-100">
                        <td className="py-1.5 pr-3">{r.title}</td>
                        <td className="py-1.5 pr-3">{r.source}</td>
                        <td className="py-1.5 pr-3">{r.category}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{r.relevance}</td>
                        <td className="py-1.5">{r.publication_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
