"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Volume2, VolumeX } from "lucide-react";
import { renderGideonText } from "@/components/gideonText";
import { useGideonSpeechOutput } from "@/hooks/useGideonSpeechOutput";
import { SUMMIT_SUGGESTED_QUESTIONS } from "@/lib/summit-space/constants";

type Props = {
  summitSlug: string;
  placeholder?: string;
  onAnswered?: () => void;
};

const SUMMIT_ANSWER_ID = "summit-gideon-answer";

function scrollResponseIntoView(node: HTMLElement | null) {
  if (!node) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      node.focus({ preventScroll: true });
    });
  });
}

function answerPlainText(answer: string, sources: string[]): string {
  if (!sources.length) return answer.trim();
  if (/\bSource:\s*/i.test(answer)) return answer.trim();
  return `${answer.trim()}\n\nSource: ${sources.join(", ")}`.trim();
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
  const [copied, setCopied] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);
  const { speak, speakingMessageId, supported: speechSupported } =
    useGideonSpeechOutput();

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

  async function copyAnswer() {
    const text = answerPlainText(answer, sources);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked.
    }
  }

  const answerHasSource = /\bSource:\s*/i.test(answer);
  const showResponse = loading || Boolean(answer);
  const plainText = answerPlainText(answer, sources);
  const speaking = speakingMessageId === SUMMIT_ANSWER_ID;

  const actionClass =
    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-700/80 hover:text-zinc-100 disabled:opacity-50";

  return (
    <section
      id="ask-gideon"
      className="scroll-mt-20 overflow-hidden rounded-2xl border border-zinc-800 bg-[#171717] text-zinc-100 shadow-xl"
    >
      <div className="border-b border-zinc-800 px-4 py-3 sm:px-5">
        <p className="text-sm font-medium text-zinc-200">Ask Gideon</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Answers from verified summit knowledge
        </p>
      </div>

      <div className="p-4 sm:p-5">
        {showResponse ? (
          <div
            ref={responseRef}
            tabIndex={-1}
            className="scroll-mt-24 outline-none"
            aria-live="polite"
            aria-busy={loading}
          >
            {loading ? (
              <div className="flex items-center gap-2 rounded-xl bg-[#212121] px-4 py-4 text-sm text-zinc-400">
                <span className="inline-flex gap-1" aria-hidden>
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:300ms]" />
                </span>
                Thinking…
              </div>
            ) : (
              <div className="rounded-xl bg-[#212121] px-4 py-4">
                <div className="whitespace-pre-wrap leading-7 text-zinc-100 [&_a]:text-sky-400 [&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:text-sky-300">
                  {renderGideonText(answer)}
                </div>
                {sources.length > 0 && !answerHasSource ? (
                  <div className="mt-4 border-t border-zinc-700 pt-3 text-xs text-zinc-500">
                    Source: {renderGideonText(sources.join(", "))}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-zinc-800 pt-3">
                  <button
                    type="button"
                    onClick={() => void copyAnswer()}
                    disabled={!plainText}
                    className={actionClass}
                    aria-label={copied ? "Copied" : "Copy response"}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  {speechSupported ? (
                    <button
                      type="button"
                      onClick={() => speak(SUMMIT_ANSWER_ID, plainText)}
                      disabled={!plainText}
                      className={actionClass}
                      aria-label={speaking ? "Stop reading aloud" : "Read aloud"}
                    >
                      {speaking ? (
                        <VolumeX className="h-3.5 w-3.5" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5" />
                      )}
                      {speaking ? "Stop" : "Read aloud"}
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ) : null}

        <form
          onSubmit={submit}
          className={`flex gap-2 ${showResponse ? "mt-4" : ""}`}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-[#2f2f2f] px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            aria-label="Ask Gideon about the summit"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="shrink-0 rounded-xl bg-zinc-100 px-5 py-3 font-semibold text-zinc-900 hover:bg-white disabled:opacity-50"
          >
            {loading ? "…" : "Ask"}
          </button>
        </form>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Suggested questions
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUMMIT_SUGGESTED_QUESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={loading}
                onClick={() => void ask(s)}
                className="rounded-full border border-zinc-700 bg-[#2f2f2f] px-3 py-2 text-left text-sm text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-700 disabled:opacity-60"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
