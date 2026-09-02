"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { renderGideonText } from "@/components/gideonText";
import { SUMMIT_SUGGESTED_QUESTIONS } from "@/lib/summit-space/constants";

type Props = {
  summitSlug: string;
  placeholder?: string;
  onAnswered?: () => void;
};

function scrollResponseIntoView(node: HTMLElement | null) {
  if (!node) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      node.focus({ preventScroll: true });
    });
  });
}

export default function SummitAskGideon({
  summitSlug,
  placeholder = "Ask about the summit…",
  onAnswered,
}: Props) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);

  const scrollToResponse = useCallback(() => {
    scrollResponseIntoView(responseRef.current);
  }, []);

  useEffect(() => {
    if (!loading && !answer) return;
    scrollToResponse();
  }, [loading, answer, scrollToResponse]);

  async function ask(value: string) {
    setQuestion(value);
    setLoading(true);
    setAnswer("");
    setSources([]);
    const res = await fetch(`/api/public/summit/${summitSlug}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: value }),
    });
    const json = await res.json();
    setAnswer(json.answer || json.error || "I couldn't answer that.");
    setSources(json.sources || []);
    setLoading(false);
    onAnswered?.();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (question.trim()) void ask(question.trim());
  }

  const answerHasSource = /\bSource:\s*/i.test(answer);
  const showResponse = loading || Boolean(answer);

  return (
    <section id="ask-gideon" className="scroll-mt-20">
      <form onSubmit={submit} className="flex gap-2">
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

      {showResponse ? (
        <div
          ref={responseRef}
          tabIndex={-1}
          className="mt-4 min-h-[4rem] scroll-mt-24 rounded-2xl bg-stone-50 p-5 outline-none"
          aria-live="polite"
          aria-busy={loading}
        >
          {loading ? (
            <p className="text-ink-muted">Thinking…</p>
          ) : (
            <>
              <div className="whitespace-pre-wrap leading-7">
                {renderGideonText(answer)}
              </div>
              {sources.length > 0 && !answerHasSource ? (
                <div className="mt-4 border-t border-stone-200 pt-3 text-xs text-ink-muted">
                  Source: {renderGideonText(sources.join(", "))}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Suggested questions
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SUMMIT_SUGGESTED_QUESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={loading}
              onClick={() => void ask(s)}
              className="rounded-full border border-stone-200 bg-white px-3 py-2 text-left text-sm hover:bg-stone-50 disabled:opacity-60"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
