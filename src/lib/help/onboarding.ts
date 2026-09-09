/**
 * Getting-started checklist helpers (pure — safe for unit tests).
 */

import { DOCUMENTS_PATH } from "@/lib/routes";

export const GETTING_STARTED_DISMISS_KEY = "guardian:getting-started-dismissed";

export type OnboardingStepId = "daily_log" | "document" | "ask_gideon";

export type OnboardingProgress = {
  hasVault: boolean;
  hasDocument: boolean;
  hasDailyLog: boolean;
  hasAskedGideon: boolean;
};

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  /** Path or hash-friendly href builder when a profile is active. */
  href: (activeProfileId: string | null) => string;
  cta: string;
  done: (p: OnboardingProgress) => boolean;
};

/**
 * Activation path: Tell Guardian first (mental-load win), then add a document.
 * Ask Gideon is explore-more after there's something to ask about.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "daily_log",
    title: "Tell Guardian one thing",
    description:
      "A deadline, promise, or note you'd otherwise keep in your head — Guardian holds it.",
    href: () => "/history?tell=1",
    cta: "Tell Guardian",
    done: (p) => p.hasDailyLog,
  },
  {
    id: "document",
    title: "Add a document",
    description:
      "Scan or upload a PDF or photo so Guardian can find dates and key facts.",
    href: (profileId) =>
      profileId
        ? `/dashboard?docs=1&camera=1#documents-${profileId}`
        : DOCUMENTS_PATH,
    cta: "Scan or upload",
    done: (p) => p.hasDocument,
  },
  {
    id: "ask_gideon",
    title: "Ask Gideon",
    description:
      "Optional — look something up in your files and notes once Guardian has memory.",
    href: () => "/ask",
    cta: "Ask Gideon",
    done: (p) => p.hasAskedGideon,
  },
];

export function nextIncompleteStep(
  progress: OnboardingProgress
): OnboardingStep | null {
  return ONBOARDING_STEPS.find((s) => !s.done(progress)) ?? null;
}

export function completedStepCount(progress: OnboardingProgress): number {
  return ONBOARDING_STEPS.filter((s) => s.done(progress)).length;
}

export function isOnboardingComplete(progress: OnboardingProgress): boolean {
  return completedStepCount(progress) === ONBOARDING_STEPS.length;
}

/** Core activation: Tell Guardian (first win). Document is the second beat. */
export function isActivationComplete(progress: OnboardingProgress): boolean {
  return progress.hasDailyLog;
}

export type ActivationChip = {
  step: 1 | 2;
  total: 2;
  title: string;
  description: string;
  href: (activeProfileId: string | null) => string;
  cta: string;
};

export function nextActivationChip(
  progress: OnboardingProgress
): ActivationChip | null {
  if (!progress.hasDailyLog) {
    return {
      step: 1,
      total: 2,
      title: "Tell Guardian one thing",
      description:
        "What's taking up space in your head? A deadline or promise is enough.",
      href: () => "/history?tell=1",
      cta: "Tell Guardian",
    };
  }
  if (!progress.hasDocument) {
    return {
      step: 2,
      total: 2,
      title: "Add a document",
      description: "Upload or scan something so Guardian can watch dates in it.",
      href: (profileId) =>
        profileId
          ? `/dashboard?docs=1&camera=1#documents-${profileId}`
          : DOCUMENTS_PATH,
      cta: "Scan or upload",
    };
  }
  return null;
}

export function readGettingStartedDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GETTING_STARTED_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeGettingStartedDismissed(dismissed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (dismissed) {
      window.localStorage.setItem(GETTING_STARTED_DISMISS_KEY, "1");
    } else {
      window.localStorage.removeItem(GETTING_STARTED_DISMISS_KEY);
    }
  } catch {
    /* ignore quota / private mode */
  }
}
