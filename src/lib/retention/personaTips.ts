/**
 * Persona-tuned retention email tips (pure — unit-test safe).
 */

import {
  isOnboardingIntent,
  type OnboardingIntent,
} from "@/lib/onboarding/intent";

export function parseOnboardingIntent(
  value: unknown
): OnboardingIntent | null {
  return isOnboardingIntent(value) ? value : null;
}

export type RetentionTip = {
  example: string;
  bodyExtra: string;
  ctaLabel: string;
};

export function tipForIntent(
  intent: OnboardingIntent | null,
  key: "welcome" | "nudge_no_document" | "nudge_try_gideon"
): RetentionTip {
  const tips: Record<
    OnboardingIntent,
    Record<"welcome" | "nudge_no_document" | "nudge_try_gideon", RetentionTip>
  > = {
    personal: {
      welcome: {
        example: "a receipt, warranty, or travel plan",
        bodyExtra:
          "Start with something simple from everyday life — then ask Gideon instead of searching.",
        ctaLabel: "Add your first document",
      },
      nudge_no_document: {
        example: "a receipt or warranty",
        bodyExtra:
          "Upload a receipt, flyer, or note so Guardian can find dates and amounts.",
        ctaLabel: "Scan or upload a document",
      },
      nudge_try_gideon: {
        example: "what's coming up",
        bodyExtra: "Ask Gideon about dates, amounts, or what needs attention.",
        ctaLabel: "Ask Gideon",
      },
    },
    family: {
      welcome: {
        example: "a school flyer or activity schedule",
        bodyExtra:
          "Start with a camp flyer or school newsletter — Guardian will find the dates that matter.",
        ctaLabel: "Add a family document",
      },
      nudge_no_document: {
        example: "a school flyer",
        bodyExtra:
          "Upload a school flyer, newsletter, or activity schedule so you can ask instead of digging through email.",
        ctaLabel: "Upload a school flyer",
      },
      nudge_try_gideon: {
        example: "upcoming activities",
        bodyExtra: "Ask Gideon what's coming up for your family this week.",
        ctaLabel: "Ask Gideon",
      },
    },
    business: {
      welcome: {
        example: "an invoice or contract",
        bodyExtra:
          "Start with an invoice or contract — Guardian will pull out amounts, terms, and deadlines.",
        ctaLabel: "Add a business document",
      },
      nudge_no_document: {
        example: "an invoice",
        bodyExtra:
          "Upload an invoice, contract, or client file so Gideon can summarize what matters.",
        ctaLabel: "Upload an invoice",
      },
      nudge_try_gideon: {
        example: "deadlines and terms",
        bodyExtra: "Ask Gideon about payment terms, amounts, or upcoming deadlines.",
        ctaLabel: "Ask Gideon",
      },
    },
    school: {
      welcome: {
        example: "a lesson plan, assignment, or school flyer",
        bodyExtra:
          "Start with classroom or school paperwork — then ask Gideon instead of searching folders.",
        ctaLabel: "Add a school document",
      },
      nudge_no_document: {
        example: "class notes or a syllabus",
        bodyExtra:
          "Upload a lesson plan, assignment, or school flyer so Guardian can remember what's due.",
        ctaLabel: "Upload school paperwork",
      },
      nudge_try_gideon: {
        example: "what's due",
        bodyExtra: "Ask Gideon what's due soon or what to prepare for this week.",
        ctaLabel: "Ask Gideon",
      },
    },
    organization: {
      welcome: {
        example: "a policy, proposal, or meeting notes",
        bodyExtra:
          "Start with a policy, proposal, or team document — Guardian will surface dates, commitments, and follow-ups.",
        ctaLabel: "Add an organization document",
      },
      nudge_no_document: {
        example: "a policy or proposal",
        bodyExtra:
          "Upload a policy, proposal, or meeting notes so Gideon can summarize what your organization needs to remember.",
        ctaLabel: "Upload a document",
      },
      nudge_try_gideon: {
        example: "commitments and follow-ups",
        bodyExtra:
          "Ask Gideon about commitments, upcoming dates, or what needs follow-up.",
        ctaLabel: "Ask Gideon",
      },
    },
    other: {
      welcome: {
        example: "any document you're comfortable storing",
        bodyExtra:
          "Upload something useful — Guardian finds dates and key facts so you can ask Gideon later.",
        ctaLabel: "Add your first document",
      },
      nudge_no_document: {
        example: "a PDF or photo",
        bodyExtra:
          "Scan or upload a document so Guardian can find dates and key facts.",
        ctaLabel: "Scan or upload a document",
      },
      nudge_try_gideon: {
        example: "your documents",
        bodyExtra: "Ask Gideon a question about what's in your vault.",
        ctaLabel: "Ask Gideon",
      },
    },
  };

  const intentKey = intent ?? "other";
  return tips[intentKey][key];
}
