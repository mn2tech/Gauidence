"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import GuardianLogo from "@/components/brand/GuardianLogo";
import { GUARDIAN_BRAND_TAGLINE } from "@/lib/branding";
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

export default function OnboardingIntentScreen({ onComplete }: Props) {
  const [step, setStep] = useState<"intent" | "school">("intent");
  const [intent, setIntent] = useState<OnboardingIntent | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(args: {
    skip?: boolean;
    intent?: OnboardingIntent;
    schoolIntent?: SchoolIntent;
  }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          args.skip
            ? { skip: true }
            : {
                intent: args.intent,
                schoolIntent: args.schoolIntent,
              }
        ),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        activeProfileId?: string | null;
        skipped?: boolean;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save your choice. Try again.");
        return;
      }
      if (args.skip) {
        trackOnboardingEvent("intent_skipped");
      } else {
        trackOnboardingEvent("intent_completed", {
          intent: args.intent ?? null,
        });
      }
      onComplete({
        activeProfileId: body.activeProfileId ?? null,
        skipped: Boolean(body.skipped ?? args.skip),
      });
    } catch {
      setError("Couldn't save your choice. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  function pickIntent(id: OnboardingIntent) {
    if (saving) return;
    if (id === "school") {
      setIntent(id);
      setStep("school");
      return;
    }
    void submit({ intent: id });
  }

  function pickSchool(id: SchoolIntent) {
    if (saving) return;
    void submit({ intent: "school", schoolIntent: id });
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-brand-light/60 via-background to-background">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <GuardianLogo variant="horizontal" size="sm" surface="black" />
        <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
          {GUARDIAN_BRAND_TAGLINE}
        </p>
        {step === "intent" ? (
          <>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              What brings you to Guardian today?
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              We&apos;ll set up the right space so you can add something useful
              and ask Gideon — instead of searching.
            </p>
            <ul className="mt-6 grid gap-2.5">
              {INTENT_OPTIONS.map((opt) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => pickIntent(opt.id)}
                    className="flex w-full items-start gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-left transition hover:border-brand hover:bg-brand-light/40 disabled:opacity-60"
                  >
                    <span className="text-xl" aria-hidden>
                      {opt.emoji}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                        {opt.description}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setStep("intent");
                setIntent(null);
              }}
              className="self-start text-sm font-medium text-brand hover:text-brand-dark disabled:opacity-50"
            >
              ← Back
            </button>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              School — which fits best?
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              We&apos;ll create a space tailored for classroom or student life.
            </p>
            <ul className="mt-6 grid gap-2.5">
              {SCHOOL_INTENT_OPTIONS.map((opt) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => pickSchool(opt.id)}
                    className="flex w-full items-start gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-left transition hover:border-brand hover:bg-brand-light/40 disabled:opacity-60"
                  >
                    <span className="text-xl" aria-hidden>
                      {opt.emoji}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                        {opt.description}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        {saving ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Setting up your space…
          </p>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit({ skip: true })}
            className="mt-6 text-center text-sm font-medium text-ink-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            Just explore
          </button>
        )}

        {intent === "school" && step === "school" ? (
          <p className="sr-only">School follow-up for {intent}</p>
        ) : null}
      </div>
    </div>
  );
}
