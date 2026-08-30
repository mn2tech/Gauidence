"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Sparkles } from "lucide-react";
import {
  DEMO_SAMPLE_DOCS,
  DEMO_STARTER_QUESTIONS,
} from "@/lib/demo/sampleVaultDocs";
import { answerDemoQuestion } from "@/lib/demo/scriptedAnswers";
import { GIDEON_BRAND_LINE } from "@/lib/vault/gideon";

type Turn = {
  role: "user" | "assistant";
  text: string;
  sources?: string[];
};

type Props = {
  initialQuestion?: string;
};

export default function DemoVaultAsk({ initialQuestion = "" }: Props) {
  const [question, setQuestion] = useState(initialQuestion);
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "assistant",
      text: "This is a sample vault — lease, auto insurance, and an HOA notice. Ask me anything about them.",
    },
  ]);
  const autoAsked = useRef(false);

  async function ask(value: string) {
    const trimmed = value.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setQuestion(trimmed);
    setTurns((prev) => [...prev, { role: "user", text: trimmed }]);

    await new Promise((resolve) => window.setTimeout(resolve, 550));
    const reply = answerDemoQuestion(trimmed);
    setTurns((prev) => [
      ...prev,
      { role: "assistant", text: reply.answer, sources: reply.sources },
    ]);
    setLoading(false);
  }

  useEffect(() => {
    if (!initialQuestion.trim() || autoAsked.current) return;
    autoAsked.current = true;
    void ask(initialQuestion);
    // Only auto-ask once from the deep link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] lg:gap-14">
      <aside>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">
          Sample vault
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Ask Gideon — no account needed.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-muted">
          {GIDEON_BRAND_LINE} These documents are examples so you can feel how
          Guardian works before you add your own.
        </p>

        <ul className="mt-8 space-y-4">
          {DEMO_SAMPLE_DOCS.map((doc) => (
            <li key={doc.id} className="flex gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand">
                <FileText className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {doc.title}
                </p>
                <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-ink-muted">
                  {doc.kind}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  {doc.summary}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex min-h-[28rem] flex-col rounded-2xl border border-border-subtle bg-white/90 p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-brand">
          <Sparkles className="h-4 w-4" />
          Ask Gideon
        </div>

        <div className="mt-4 flex flex-1 flex-col gap-3 overflow-y-auto">
          {turns.map((turn, index) => (
            <div
              key={`${turn.role}-${index}`}
              className={
                turn.role === "user"
                  ? "ml-8 rounded-2xl bg-brand px-4 py-3 text-sm text-white"
                  : "mr-4 rounded-2xl bg-brand-light/70 px-4 py-3 text-sm leading-relaxed text-foreground"
              }
            >
              <p className="whitespace-pre-wrap">{turn.text}</p>
              {turn.sources && turn.sources.length > 0 ? (
                <p className="mt-3 border-t border-brand/15 pt-2 text-xs text-ink-muted">
                  From your documents: {turn.sources.join(" · ")}
                </p>
              ) : null}
            </div>
          ))}
          {loading ? (
            <p className="mr-4 text-sm text-ink-muted">Gideon is reading…</p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {DEMO_STARTER_QUESTIONS.map((starter) => (
            <button
              key={starter}
              type="button"
              disabled={loading}
              onClick={() => void ask(starter)}
              className="rounded-xl border border-border-subtle bg-background px-3 py-2 text-left text-xs font-medium text-foreground transition hover:border-brand hover:text-brand disabled:opacity-50 sm:text-sm"
            >
              {starter}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="mt-4 flex gap-2">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about the sample documents…"
            disabled={loading}
            className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-background px-3 py-3 text-sm outline-none ring-brand focus:ring-2 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            Ask
          </button>
        </form>

        <div className="mt-6 border-t border-border-subtle pt-5 text-center">
          <p className="text-sm text-ink-muted">
            Ready for your real documents?
          </p>
          <Link
            href="/signup"
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            Create my vault
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
