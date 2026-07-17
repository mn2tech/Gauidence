/**
 * Getting-started checklist helpers (pure — safe for unit tests).
 */

export const GETTING_STARTED_DISMISS_KEY = "guardian:getting-started-dismissed";

export type OnboardingStepId =
  | "vault"
  | "document"
  | "daily_log"
  | "ask_gideon";

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

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "vault",
    title: "Create your first vault",
    description:
      "Choose who you're helping — yourself, family, a client, or another space.",
    href: () => "/settings/profiles?add=1",
    cta: "Create a vault",
    done: (p) => p.hasVault,
  },
  {
    id: "document",
    title: "Add a document",
    description:
      "Scan or upload a PDF or photo so Guardian can find dates and key facts.",
    href: (profileId) =>
      profileId
        ? `/dashboard?camera=1#documents-${profileId}`
        : "/dashboard",
    cta: "Scan or upload",
    done: (p) => p.hasDocument,
  },
  {
    id: "daily_log",
    title: "Write a Daily Log",
    description:
      "Capture a quick note, event, or observation in that vault’s timeline.",
    href: (profileId) =>
      profileId ? `/dashboard#daily-log-${profileId}` : "/dashboard",
    cta: "Open Daily Log",
    done: (p) => p.hasDailyLog,
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
