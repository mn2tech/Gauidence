"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import GideonAvatar from "@/components/GideonAvatar";
import {
  GUARDIAN_COACH_OPENING,
  type CoachMessage,
  type CoachSetupResult,
} from "@/lib/onboarding/coach";
import {
  INTENT_OPTIONS,
  SCHOOL_INTENT_OPTIONS,
  type OnboardingIntent,
  type SchoolIntent,
} from "@/lib/onboarding/intent";
import { trackOnboardingEvent } from "@/lib/onboarding/events";

type Props = {
  onComplete: (result: {
    activeProfileId: string | null;
    skipped: boolean;
  }) => void | Promise<void>;
};

type PendingSetup = CoachSetupResult & {
  needsSchoolIntent?: boolean;
};

export default function GuardianCoachScreen({ onComplete }: Props) {
  const [messages, setMessages] = useState<CoachMessage[]>([
    { role: "assistant", content: GUARDIAN_COACH_OPENING },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSetup, setPendingSetup] = useState<PendingSetup | null>(null);
  const [schoolStep, setSchoolStep] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingSetup, schoolStep, sending]);

  async function finalizeSetup(
    args:
      | { skip: true }
      | {
          intent: OnboardingIntent;
          schoolIntent?: SchoolIntent;
          workspaceName?: string | null;
        }
  ) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          "skip" in args && args.skip
            ? { skip: true }
            : {
                intent: args.intent,
                schoolIntent: args.schoolIntent,
                workspaceName: args.workspaceName ?? undefined,
              }
        ),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        activeProfileId?: string | null;
        skipped?: boolean;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save your setup. Try again.");
        return;
      }
      if ("skip" in args && args.skip) {
        trackOnboardingEvent("intent_skipped");
      } else {
        trackOnboardingEvent("intent_completed", { intent: args.intent });
        trackOnboardingEvent("coach_completed", { intent: args.intent });
      }
      await onComplete({
        activeProfileId: body.activeProfileId ?? null,
        skipped: Boolean(body.skipped ?? ("skip" in args && args.skip)),
      });
    } catch {
      setError("Couldn't save your setup. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  function applySetup(setup: CoachSetupResult) {
    if (setup.intent === "school" && !setup.schoolIntent) {
      setPendingSetup({ ...setup, needsSchoolIntent: true });
      setSchoolStep(true);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "School — which fits best? Pick teacher, student, or parent below.",
        },
      ]);
      return;
    }
    setPendingSetup(setup);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending || saving) return;

    const nextMessages: CoachMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);
    setPendingSetup(null);
    setSchoolStep(false);

    try {
      const res = await fetch("/api/account/onboarding/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        reply?: string;
        setup?: CoachSetupResult | null;
      };
      if (!res.ok) {
        setError(
          body.error ??
            "Gideon couldn't respond. Pick an option below or try again."
        );
        return;
      }
      const reply =
        body.reply?.trim() ||
        "Thanks — tell me a bit more about what you're organizing.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      if (body.setup) applySetup(body.setup);
    } catch {
      setError("Couldn't reach Gideon. Pick an option below or try again.");
    } finally {
      setSending(false);
    }
  }

  function pickIntent(id: OnboardingIntent) {
    if (saving || sending) return;
    if (id === "school") {
      setSchoolStep(true);
      setMessages((prev) => [
        ...prev,
        { role: "user", content: INTENT_OPTIONS.find((o) => o.id === id)!.label },
        {
          role: "assistant",
          content: "School — which fits best? Pick one below.",
        },
      ]);
      return;
    }
    void finalizeSetup({ intent: id });
  }

  function pickSchool(id: SchoolIntent) {
    if (saving || sending) return;
    const workspaceName = pendingSetup?.workspaceName ?? null;
    void finalizeSetup({
      intent: "school",
      schoolIntent: id,
      workspaceName,
    });
  }

  const showIntentChips =
    !pendingSetup && !schoolStep && !sending && !saving && messages.length <= 2;
  const showSchoolChips = schoolStep && !saving;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-brand-light/60 via-background to-background">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-6 sm:px-6">
        <p className="text-sm font-semibold tracking-tight text-brand">Guardian</p>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Meet Gideon — your setup coach
        </h1>

        <div className="mt-4 flex-1 space-y-4 overflow-y-auto pb-4">
          {messages.map((msg, idx) => (
            <div
              key={`${msg.role}-${idx}`}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
            >
              {msg.role === "assistant" ? (
                <GideonAvatar size={36} className="mt-0.5 shrink-0" />
              ) : null}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-brand text-white"
                    : "border border-stone-200 bg-white text-foreground"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {sending ? (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <GideonAvatar size={32} pulse />
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Gideon is thinking…
            </div>
          ) : null}

          {pendingSetup && !pendingSetup.needsSchoolIntent ? (
            <div className="rounded-2xl border border-brand/30 bg-brand-light/50 p-4">
              <p className="text-sm font-semibold text-foreground">
                Recommended setup
              </p>
              {pendingSetup.summary ? (
                <p className="mt-1 text-sm text-ink-muted">
                  {pendingSetup.summary}
                </p>
              ) : null}
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void finalizeSetup({
                    intent: pendingSetup.intent,
                    schoolIntent: pendingSetup.schoolIntent ?? undefined,
                    workspaceName: pendingSetup.workspaceName,
                  })
                }
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Create my Guardian
              </button>
            </div>
          ) : null}

          {showIntentChips ? (
            <ul className="grid gap-2">
              {INTENT_OPTIONS.map((opt) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => pickIntent(opt.id)}
                    className="flex w-full items-start gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left transition hover:border-brand hover:bg-brand-light/40 disabled:opacity-60"
                  >
                    <span className="text-lg" aria-hidden>
                      {opt.emoji}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {opt.description}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {showSchoolChips ? (
            <ul className="grid gap-2">
              {SCHOOL_INTENT_OPTIONS.map((opt) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => pickSchool(opt.id)}
                    className="flex w-full items-start gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left transition hover:border-brand hover:bg-brand-light/40 disabled:opacity-60"
                  >
                    <span className="text-lg" aria-hidden>
                      {opt.emoji}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {opt.description}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div ref={bottomRef} />
        </div>

        {error ? (
          <p
            role="alert"
            className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        <form
          className="sticky bottom-0 flex gap-2 border-t border-stone-200 bg-background/95 pb-2 pt-3 backdrop-blur"
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage(input);
          }}
        >
          <label className="sr-only" htmlFor="coach-input">
            Message Gideon
          </label>
          <input
            id="coach-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell Gideon about your life, work, or family…"
            disabled={sending || saving}
            className="min-w-0 flex-1 rounded-full border border-stone-200 px-4 py-2.5 text-sm outline-none ring-brand focus:ring-2 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || saving || !input.trim()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-dark disabled:opacity-50"
            aria-label="Send"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>

        <button
          type="button"
          disabled={saving || sending}
          onClick={() => void finalizeSetup({ skip: true })}
          className="mt-2 text-center text-sm font-medium text-ink-muted underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
        >
          Just explore
        </button>
      </div>
    </div>
  );
}
