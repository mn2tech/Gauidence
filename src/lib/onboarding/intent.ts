/**
 * First-run intent capture — pure helpers (safe for unit tests).
 */

import type { GuardianProfileType } from "@/lib/profiles/types";
import type { SuggestionProfileKind } from "@/lib/vault/gideon";

export const ONBOARDING_INTENTS = [
  "business",
  "personal",
  "family",
  "school",
  "organization",
  "other",
] as const;

export type OnboardingIntent = (typeof ONBOARDING_INTENTS)[number];

export const SCHOOL_INTENTS = ["teacher", "student", "parent"] as const;
export type SchoolIntent = (typeof SCHOOL_INTENTS)[number];

export function isOnboardingIntent(value: unknown): value is OnboardingIntent {
  return (
    typeof value === "string" &&
    (ONBOARDING_INTENTS as readonly string[]).includes(value)
  );
}

export function isSchoolIntent(value: unknown): value is SchoolIntent {
  return (
    typeof value === "string" &&
    (SCHOOL_INTENTS as readonly string[]).includes(value)
  );
}

export type IntentOption = {
  id: OnboardingIntent;
  label: string;
  description: string;
  emoji: string;
};

export const INTENT_OPTIONS: IntentOption[] = [
  {
    id: "business",
    label: "Business",
    description: "Contracts, clients, invoices, and company knowledge",
    emoji: "💼",
  },
  {
    id: "personal",
    label: "Personal",
    description: "Everyday documents, notes, receipts, and plans",
    emoji: "👤",
  },
  {
    id: "family",
    label: "Family",
    description: "Household paperwork, activities, and shared life",
    emoji: "👨‍👩‍👧",
  },
  {
    id: "school",
    label: "School",
    description: "Teaching, studying, or supporting a student’s records",
    emoji: "🎓",
  },
  {
    id: "organization",
    label: "Organization",
    description: "Nonprofit, team, church, or community knowledge",
    emoji: "🏛️",
  },
];

export type SchoolIntentOption = {
  id: SchoolIntent;
  label: string;
  description: string;
  emoji: string;
};

export const SCHOOL_INTENT_OPTIONS: SchoolIntentOption[] = [
  {
    id: "teacher",
    label: "I’m a teacher",
    description: "Lesson plans, classroom notes, and school paperwork",
    emoji: "🏫",
  },
  {
    id: "student",
    label: "I’m a student",
    description: "Homework, notes, assignments, and exams",
    emoji: "🎓",
  },
  {
    id: "parent",
    label: "I’m a parent of a student",
    description: "School flyers, newsletters, and activity schedules",
    emoji: "🧒",
  },
];

/** What vault to create (if any) after intent is chosen. */
export type IntentVaultAction = {
  /** PROFILE_CREATE_OPTIONS id, or null to keep the auto personal vault. */
  optionId: string | null;
  profileType: GuardianProfileType;
  displayName: string;
  relationship?: string;
  /** Switch active vault to the new one after create. */
  switchToNew: boolean;
};

export function vaultActionForIntent(
  intent: OnboardingIntent,
  schoolIntent?: SchoolIntent | null
): IntentVaultAction {
  switch (intent) {
    case "personal":
    case "other":
      return {
        optionId: null,
        profileType: "personal",
        displayName: "My Personal",
        relationship: "Myself",
        switchToNew: false,
      };
    case "family":
      return {
        optionId: "my_family",
        profileType: "family",
        displayName: "My Family",
        switchToNew: true,
      };
    case "business":
      return {
        optionId: "business",
        profileType: "business",
        displayName: "My Business",
        switchToNew: true,
      };
    case "organization":
      return {
        optionId: "nonprofit",
        profileType: "non_profit",
        displayName: "My Organization",
        switchToNew: true,
      };
    case "school": {
      const school = schoolIntent ?? "student";
      if (school === "teacher") {
        return {
          optionId: "teacher",
          profileType: "teacher",
          displayName: "Teaching",
          relationship: "Teacher",
          switchToNew: true,
        };
      }
      if (school === "parent") {
        return {
          optionId: "child",
          profileType: "child",
          displayName: "My child",
          relationship: "Child",
          switchToNew: true,
        };
      }
      return {
        optionId: "student",
        profileType: "student",
        displayName: "My studies",
        relationship: "Student",
        switchToNew: true,
      };
    }
  }
}

/** Map intent (+ school) to Gideon vault template kind. */
export function suggestionKindForIntent(
  intent: OnboardingIntent,
  schoolIntent?: SchoolIntent | null
): SuggestionProfileKind {
  switch (intent) {
    case "personal":
    case "other":
      return "personal";
    case "family":
      return "family";
    case "business":
    case "organization":
      return "business";
    case "school": {
      const school = schoolIntent ?? "student";
      if (school === "teacher") return "teacher";
      if (school === "parent") return "child";
      return "student";
    }
  }
}

export type OnboardingStatus = {
  needsOnboarding: boolean;
  intent: OnboardingIntent | null;
  completedAt: string | null;
  skipped: boolean;
  step?: string | null;
  firstValueReachedAt?: string | null;
};

export function computeNeedsOnboarding(row: {
  onboarding_completed_at: string | null;
  onboarding_skipped: boolean;
}): boolean {
  return !row.onboarding_completed_at && !row.onboarding_skipped;
}

/** Persona-tuned primary upload CTA for empty vault welcome. */
export function uploadCtaForProfileKind(
  kind: SuggestionProfileKind | string | null | undefined
): string {
  switch (kind) {
    case "family":
    case "child":
      return "Upload a school flyer or schedule";
    case "business":
    case "non_profit":
    case "client":
    case "employee":
      return "Upload an invoice or contract";
    case "teacher":
      return "Upload a lesson plan or notes";
    case "student":
      return "Upload homework or class notes";
    case "vehicle":
      return "Upload a maintenance receipt";
    case "home":
      return "Upload a home document";
    case "pet":
      return "Upload a vet or pet record";
    case "hobby":
      return "Upload a schedule or notes";
    case "event":
      return "Upload a timeline, guest list, or vendor contract";
    default:
      return "Upload a document or photo";
  }
}

/** Default Gideon question after first upload when the user didn’t type one. */
export function autoQuestionForUpload(args: {
  kind?: SuggestionProfileKind | string | null;
  fileName: string;
  isImage: boolean;
}): string {
  if (args.isImage) {
    return "What do you see in this image? Transcribe any lists, dates, or notes clearly.";
  }
  const name = args.fileName || "this document";
  switch (args.kind) {
    case "family":
    case "child":
      return `What dates and action items are in ${name}?`;
    case "business":
    case "non_profit":
    case "client":
    case "employee":
      return `Summarize the key terms, amounts, and deadlines in ${name}.`;
    case "teacher":
      return `What should I remember from ${name} for my classes?`;
    case "student":
      return `What’s due and what are the main points in ${name}?`;
    default:
      return `Summarize what matters in ${name} — dates, amounts, and anything I should act on.`;
  }
}

