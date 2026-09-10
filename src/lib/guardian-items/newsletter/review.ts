/**
 * Safe review summary after school-newsletter extraction.
 */

import type { GuardianExtractedItem } from "../schema";
import type { NewsletterExtractionMeta } from "./extract";

export type NewsletterReviewCounts = {
  upcomingEvents: number;
  homeworkInstructions: number;
  spellingWords: number;
  teacherContacts: number;
  noHomeworkDays: number;
  testsAndStudy: number;
  other: number;
};

export type NewsletterReviewSummary = {
  headline: string;
  childName: string | null;
  childId: string | null;
  needsChildConfirmation: boolean;
  counts: NewsletterReviewCounts;
  lowConfidenceItemIndexes: number[];
  items: GuardianExtractedItem[];
  meta: NewsletterExtractionMeta;
};

export function buildNewsletterReviewSummary(args: {
  items: GuardianExtractedItem[];
  meta: NewsletterExtractionMeta;
  childName?: string | null;
  childId?: string | null;
}): NewsletterReviewSummary {
  const counts: NewsletterReviewCounts = {
    upcomingEvents: 0,
    homeworkInstructions: 0,
    spellingWords: args.meta.spellingWords.length,
    teacherContacts: 0,
    noHomeworkDays: 0,
    testsAndStudy: 0,
    other: 0,
  };

  const lowConfidenceItemIndexes: number[] = [];

  args.items.forEach((item, index) => {
    if (item.confidence < 0.9) lowConfidenceItemIndexes.push(index);
    switch (item.type) {
      case "school_event":
      case "event":
      case "early_dismissal":
      case "no_school":
      case "school_closure":
        counts.upcomingEvents += 1;
        break;
      case "homework":
        counts.homeworkInstructions += 1;
        break;
      case "no_homework":
        counts.noHomeworkDays += 1;
        counts.homeworkInstructions += 1;
        break;
      case "spelling_list":
        break;
      case "school_contact":
        counts.teacherContacts += 1;
        break;
      case "test":
      case "study_reminder":
        counts.testsAndStudy += 1;
        break;
      default:
        counts.other += 1;
    }
  });

  const childName = args.childName?.trim() || null;
  const childId = args.childId ?? null;
  const needsChildConfirmation = !childId;

  const headline = childName
    ? `Added to ${childName}'s school world`
    : "Added to school world — confirm which child";

  return {
    headline,
    childName,
    childId,
    needsChildConfirmation,
    counts,
    lowConfidenceItemIndexes,
    items: args.items,
    meta: args.meta,
  };
}

export function formatReviewCountLines(counts: NewsletterReviewCounts): string[] {
  const lines: string[] = [];
  if (counts.upcomingEvents)
    lines.push(
      `${counts.upcomingEvents} upcoming event${counts.upcomingEvents === 1 ? "" : "s"}`
    );
  if (counts.homeworkInstructions)
    lines.push(
      `${counts.homeworkInstructions} homework instruction${counts.homeworkInstructions === 1 ? "" : "s"}`
    );
  if (counts.spellingWords)
    lines.push(`${counts.spellingWords} spelling words`);
  if (counts.teacherContacts)
    lines.push(
      `${counts.teacherContacts} teacher contact${counts.teacherContacts === 1 ? "" : "s"}`
    );
  if (counts.testsAndStudy)
    lines.push(
      `${counts.testsAndStudy} test/study reminder${counts.testsAndStudy === 1 ? "" : "s"}`
    );
  return lines;
}
