/**
 * Getting-started checklist helpers (pure — safe for unit tests).
 */

import { DOCUMENTS_PATH, dailyLogHref } from "@/lib/routes";

export const GETTING_STARTED_DISMISS_KEY = "guardian:getting-started-dismissed";

export type OnboardingStepId = "document" | "ask_gideon" | "daily_log";

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
 * Activation path: add a document, ask Gideon.
 * Daily Log is explore-more (listed last, not required for the core story).
 * Vault creation is automatic — not a checklist step.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "document",
    title: "Add your first document",
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
      "Ask a question about what’s in the vault — Gideon answers from your files and notes.",
    href: () => "/ask",
    cta: "Ask Gideon",
    done: (p) => p.hasAskedGideon,
  },
  {
    id: "daily_log",
    title: "Write a Daily Log",
    description:
      "Optional — capture a quick note, event, or observation in that vault’s timeline.",
    href: (profileId) => dailyLogHref(profileId),
    cta: "Open Daily Log",
    done: (p) => p.hasDailyLog,
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

/** Core activation: document + Ask Gideon (Daily Log is optional). */
export function isActivationComplete(progress: OnboardingProgress): boolean {
  return progress.hasDocument && progress.hasAskedGideon;
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
  if (!progress.hasDocument) {
    return {
      step: 1,
      total: 2,
      title: "Add a document",
      description: "Upload or scan something so Gideon has memory to work with.",
      href: (profileId) =>
        profileId
          ? `/dashboard?docs=1&camera=1#documents-${profileId}`
          : DOCUMENTS_PATH,
      cta: "Scan or upload",
    };
  }
  if (!progress.hasAskedGideon) {
    return {
      step: 2,
      total: 2,
      title: "Ask Gideon",
      description: "Ask a question about what’s in your vault.",
      href: () => "/ask",
      cta: "Ask Gideon",
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
