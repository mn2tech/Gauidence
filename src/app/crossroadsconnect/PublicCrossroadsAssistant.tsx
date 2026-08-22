"use client";
import { FormEvent, useState } from "react";

const starters = [
  "What is the next event?",
  "Where is the next event?",
  "How do I RSVP?",
  "Is there a fee?",
];

export default function PublicCrossroadsAssistant() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function ask(value: string) {
    setLoading(true);
    setAnswer("");
    setSources([]);
    const res = await fetch("/api/public/crossroadsconnect/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: value }),
    });
    const json = await res.json();
    setLoading(false);
    setAnswer(json.answer || json.error || "I couldn't answer that.");
    setSources(json.sources || []);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (question.trim()) void ask(question.trim());
  }

  const answerHasSource = /\bSource:\s*/i.test(answer);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm md:p-8">
        <div className="text-sm font-medium text-ink-muted">
          Crossroads Connect
        </div>
        <h1 className="mt-1 text-3xl font-semibold">
          Ask Gideon about our events
        </h1>
        <p className="mt-3 text-ink-muted">
          Ask about published event dates, locations, RSVP information, costs,
          and other attendee details.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {starters.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQuestion(s);
                void ask(s);
              }}
              className="rounded-full border px-3 py-2 text-sm hover:bg-black/5"
            >
              {s}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-6 flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about a Crossroads Connect event…"
            className="min-w-0 flex-1 rounded-xl border p-3"
          />
          <button
            disabled={loading}
            className="rounded-xl bg-black px-5 py-3 font-medium text-white"
          >
            {loading ? "Thinking…" : "Ask"}
          </button>
        </form>
        {answer ? (
          <div className="mt-6 rounded-2xl bg-black/[.04] p-5">
            <div className="whitespace-pre-wrap leading-7">{answer}</div>
            {sources.length > 0 && !answerHasSource ? (
              <div className="mt-4 border-t pt-3 text-xs text-ink-muted">
                Source: {sources.join(", ")}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="mt-4 text-center text-xs text-ink-muted">
        Answers are limited to information approved and published by Crossroads
        Connect. Times are shown in Eastern Time.
      </p>
    </div>
  );
}
