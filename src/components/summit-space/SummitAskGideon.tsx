"use client";

import { FormEvent, useState } from "react";
import { renderGideonText } from "@/components/gideonText";
import { SUMMIT_SUGGESTED_QUESTIONS } from "@/lib/summit-space/constants";

type Props = {
  summitSlug: string;
  placeholder?: string;
  onAnswered?: () => void;
};

export default function SummitAskGideon({
  summitSlug,
  placeholder = "Ask about the summit…",
  onAnswered,
}: Props) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function ask(value: string) {
    setLoading(true);
    setAnswer("");
    setSources([]);
    const res = await fetch(`/api/public/summit/${summitSlug}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: value }),
    });
    const json = await res.json();
    setLoading(false);
    setAnswer(json.answer || json.error || "I couldn't answer that.");
    setSources(json.sources || []);
    onAnswered?.();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (question.trim()) void ask(question.trim());
  }

  const answerHasSource = /\bSource:\s*/i.test(answer);

  return (
    <section id="ask-gideon" className="scroll-mt-4">
      <div className="flex flex-wrap gap-2">
        {SUMMIT_SUGGESTED_QUESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setQuestion(s);
              void ask(s);
            }}
            className="rounded-full border border-stone-200 bg-white px-3 py-2 text-left text-sm hover:bg-stone-50"
          >
            {s}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white p-3 text-base"
          aria-label="Ask Gideon about the summit"
        />
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 rounded-xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? "Thinking…" : "Ask Gideon"}
        </button>
      </form>
      {answer ? (
        <div className="mt-5 rounded-2xl bg-stone-50 p-5">
          <div className="whitespace-pre-wrap leading-7">
            {renderGideonText(answer)}
          </div>
          {sources.length > 0 && !answerHasSource ? (
            <div className="mt-4 border-t border-stone-200 pt-3 text-xs text-ink-muted">
              Source: {renderGideonText(sources.join(", "))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
