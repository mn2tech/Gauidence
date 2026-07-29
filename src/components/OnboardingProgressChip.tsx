"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import {
  isActivationComplete,
  nextActivationChip,
} from "@/lib/help/onboarding";

/**
 * Compact activation progress for Ask Gideon — document then ask.
 */
export default function OnboardingProgressChip() {
  const { active, profiles, loading: profilesLoading } = useActiveProfile();
  const { progress, loading } = useOnboardingProgress();

  if (profilesLoading || loading) return null;
  if (profiles.length === 0) return null;
  if (isActivationComplete(progress)) return null;

  const chip = nextActivationChip(progress);
  if (!chip) return null;

  const href = chip.href(active?.id ?? null);
  const onAskAlready = chip.step === 2;

  return (
    <div className="mx-auto mb-2 flex max-w-xl items-start gap-3 rounded-xl border border-brand/25 bg-brand-light/50 px-3 py-2.5 sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-dark">
          Step {chip.step} of {chip.total}
        </p>
        <p className="text-sm font-semibold text-foreground">{chip.title}</p>
        <p className="text-xs text-ink-muted">{chip.description}</p>
      </div>
      {onAskAlready ? (
        <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-dark ring-1 ring-brand/20">
          You’re here
        </span>
      ) : (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-dark"
        >
          {chip.cta}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}
