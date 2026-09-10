"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { renderGideonText } from "@/components/gideonText";

const starters = [
  "What is Covenant Life School's mission?",
  "How do I apply for admissions?",
  "What is the school address and phone?",
  "When is the next Open House?",
  "How do parents access the FACTS portal?",
  "Where can I find the uniform policy?",
];

export default function PublicCovenantLifeAssistant() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function ask(value: string) {
    setLoading(true);
    setAnswer("");
    setSources([]);
    try {
      const res = await fetch("/api/public/covenant-life/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: value }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
        sources?: string[];
      };
      setAnswer(json.answer || json.error || "I couldn't answer that.");
      setSources(Array.isArray(json.sources) ? json.sources : []);
    } finally {
      setLoading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (question.trim()) void ask(question.trim());
  }

  const answerHasSource = /\bSource:\s*/i.test(answer);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/branding/covenant-life-school-seal.png"
            alt="Covenant Life School seal — Preparing for the Call of God, Est. 1979"
            width={112}
            height={112}
            priority
            className="h-28 w-28 object-contain"
          />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
            Covenant Life School
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Ask Gideon about CLS
          </h1>
          <p className="mt-3 max-w-md text-ink-muted">
            Ask about admissions, academics, parent resources, calendar,
            athletics, and other information published from the official school
            website.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
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
            placeholder="Ask about Covenant Life School…"
            className="min-w-0 flex-1 rounded-xl border p-3"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-black px-5 py-3 font-medium text-white disabled:opacity-60"
          >
            {loading ? "Thinking…" : "Ask"}
          </button>
        </form>
        {answer ? (
          <div className="mt-6 rounded-2xl bg-black/[.04] p-5">
            <div className="whitespace-pre-wrap leading-7">
              {renderGideonText(answer)}
            </div>
            {sources.length > 0 && !answerHasSource ? (
              <div className="mt-4 border-t pt-3 text-xs text-ink-muted">
                Source: {renderGideonText(sources.join("; "))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="mt-4 text-center text-xs text-ink-muted">
        Guardian for Covenant Life School is an independent information assistant
        and is not affiliated with or endorsed by Covenant Life School. Answers
        use only approved published public sources — verify time-sensitive
        decisions with the school.
      </p>
      <p className="mt-2 text-center text-xs text-ink-muted">
        <a
          href="https://www.covenantlifeschool.org/"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-brand hover:underline"
        >
          Official website
        </a>
        {" · "}
        <a href="tel:3018694500" className="font-medium text-brand hover:underline">
          (301) 869-4500
        </a>
      </p>
    </div>
  );
}
