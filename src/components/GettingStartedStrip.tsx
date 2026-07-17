"use client";

import Link from "next/link";
import { ArrowRight, Check, Circle, X } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import {
  isOnboardingComplete,
  nextIncompleteStep,
  readGettingStartedDismissed,
  writeGettingStartedDismissed,
} from "@/lib/help/onboarding";
import { useEffect, useState } from "react";

/**
 * Dismissible coach strip after the first vault exists.
 * Points at the next unfinished getting-started step.
 */
export default function GettingStartedStrip() {
  const { active, profiles, loading: profilesLoading } = useActiveProfile();
  const { progress, loading } = useOnboardingProgress();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(readGettingStartedDismissed());
  }, []);

  if (profilesLoading || loading) return null;
  if (profiles.length === 0) return null;
  if (dismissed) return null;
  if (isOnboardingComplete(progress)) return null;

  const next = nextIncompleteStep(progress);
  if (!next || next.id === "vault") return null;

  const href = next.href(active?.id ?? null);

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-brand/25 bg-brand-light/40 px-4 py-3.5 sm:items-center sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">
          Next step
        </p>
        <p className="mt-0.5 text-sm font-semibold text-foreground">
          {next.title}
        </p>
        <p className="mt-0.5 text-sm text-ink-muted">{next.description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-dark"
          >
            {next.cta}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <Link
            href="/help"
            className="text-xs font-medium text-brand-dark hover:underline"
          >
            Full Quick Start
          </Link>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          writeGettingStartedDismissed(true);
          setDismissed(true);
        }}
        aria-label="Dismiss getting started tip"
        className="shrink-0 rounded-lg p-1.5 text-ink-muted transition hover:bg-white/80 hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
