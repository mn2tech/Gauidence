/**
 * Onboarding sample document — pure helpers + file builder (unit-test safe).
 */

import type { Fact } from "@/lib/analysis/types";
import { buildPastedTextFile } from "@/lib/vault/pastedText";
import type { SuggestionProfileKind } from "@/lib/vault/gideon";

/** Minimal fact shape for first-win picking (source optional). */
export type FirstWinFactInput = Pick<Fact, "label" | "value" | "date">;

export const SAMPLE_DOCUMENT_PATH = "/onboarding/sample-camp-flyer.txt";

export const SAMPLE_CAMP_FLYER_BODY = `Riverside Summer Camp — Registration Flyer

Camp dates: July 6–17, 2026
Ages: 7–12
Location: Riverside Park Community Center, 120 River Road

Registration deadline: June 15, 2026
Fee: $150 per camper (includes lunch and t-shirt)
Late fee after June 15: $25

Drop-off: 8:30 AM
Pick-up: 3:30 PM

Questions? Email camps@riversidepark.example or call (555) 014-2200.

Bring: sunscreen, water bottle, and closed-toe shoes.
`;

export const SAMPLE_RECEIPT_BODY = `AutoCare Express — Service Receipt

Date: March 12, 2026
Vehicle: 2019 Honda Civic
Invoice #: ACE-48291

Oil change + filter: $49.99
Tire rotation: $29.00
Tax: $6.32
Total paid: $85.31

Next oil change due: September 12, 2026 (or 5,000 miles)
Warranty on parts: 12 months

Thank you for visiting AutoCare Express.
`;

export function sampleBodyForProfileKind(
  kind?: SuggestionProfileKind | string | null
): { title: string; content: string; fileName: string } {
  switch (kind) {
    case "business":
    case "non_profit":
    case "client":
    case "employee":
    case "vehicle":
      return {
        title: "Sample car maintenance receipt",
        content: SAMPLE_RECEIPT_BODY,
        fileName: "Sample - car maintenance receipt.txt",
      };
    default:
      return {
        title: "Sample summer camp flyer",
        content: SAMPLE_CAMP_FLYER_BODY,
        fileName: "Sample - summer camp flyer.txt",
      };
  }
}

/** Build a sample .txt File for upload + analysis (no network required). */
export function buildSampleDocumentFile(
  kind?: SuggestionProfileKind | string | null
): File {
  const sample = sampleBodyForProfileKind(kind);
  const file = buildPastedTextFile({
    title: sample.title,
    content: sample.content,
  });
  return new File([file], sample.fileName, { type: "text/plain" });
}

export type FirstWinHighlight = {
  label: string;
  value: string;
  date: string | null;
};

/** Pick the most “wow” facts for the first-win card. */
export function pickFirstWinHighlights(
  facts: FirstWinFactInput[] | null | undefined,
  max = 3
): FirstWinHighlight[] {
  if (!facts?.length) return [];
  const withDates = facts.filter((f) => Boolean(f.date?.trim()));
  const pool = withDates.length > 0 ? withDates : facts;
  return pool.slice(0, max).map((f) => ({
    label: f.label,
    value: f.value,
    date: f.date,
  }));
}

export function firstWinHeadline(highlights: FirstWinHighlight[]): string {
  const dateCount = highlights.filter((h) => h.date).length;
  if (dateCount > 0) {
    return `Guardian found ${dateCount} important date${dateCount === 1 ? "" : "s"}`;
  }
  if (highlights.length > 0) {
    return `Guardian found useful information`;
  }
  return "Guardian now knows more about this Space";
}

export const FIRST_WIN_SEEN_KEY = "guardian:first-win-seen";

export function readFirstWinSeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(FIRST_WIN_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeFirstWinSeen(seen: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (seen) window.localStorage.setItem(FIRST_WIN_SEEN_KEY, "1");
    else window.localStorage.removeItem(FIRST_WIN_SEEN_KEY);
  } catch {
    /* ignore */
  }
}
