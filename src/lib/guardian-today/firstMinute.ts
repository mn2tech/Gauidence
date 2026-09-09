/**
 * First-60-seconds promise: reduce mental load from paperwork and promises.
 * Pure helpers — safe for unit tests.
 */

import { ADD_ANYTHING_PATH, HISTORY_PATH, SIMPLE_HOME_PATH } from "@/lib/simple-home/routing";

export const FIRST_MINUTE_PROMISE =
  "Stop carrying paperwork and promises in your head.";

export const FIRST_MINUTE_SUPPORT =
  "Tell Guardian one thing you're keeping track of. We'll bring it back when it matters.";

export const FIRST_MINUTE_HOLDING =
  "Guardian's holding this so you don't have to.";

export type FirstMinuteChip = {
  id: string;
  label: string;
  draft: string;
};

/** Example captures that prove the product in under a minute. */
export const FIRST_MINUTE_CHIPS: FirstMinuteChip[] = [
  {
    id: "passport",
    label: "Passport expires March 2027",
    draft: "Passport expires March 2027",
  },
  {
    id: "follow-up",
    label: "Follow up with Jordan next week",
    draft: "Promised Jordan a proposal next week — need to follow up",
  },
  {
    id: "registration",
    label: "Registration due June 1",
    draft: "Kids' registration is due June 1",
  },
];

export function tellGuardianHref(draft?: string | null): string {
  const qs = new URLSearchParams({ tell: "1" });
  const text = draft?.trim();
  if (text) qs.set("draft", text);
  return `${HISTORY_PATH}?${qs.toString()}`;
}

export function firstMinuteChipHref(chip: FirstMinuteChip): string {
  return tellGuardianHref(chip.draft);
}

export const FIRST_MINUTE_TELL_HREF = tellGuardianHref();
export const FIRST_MINUTE_ADD_HREF = ADD_ANYTHING_PATH;
export const FIRST_MINUTE_TODAY_HREF = SIMPLE_HOME_PATH;

export const EMPTY_NO_SOURCES = {
  title: "Give Guardian one thing to watch",
  body: "A deadline, a promise, or a document. We'll put it on Today when it needs you.",
  primaryCta: "Tell Guardian",
  secondaryCta: "Add a document",
} as const;

export const EMPTY_CAUGHT_UP = {
  title: "You're clear for now",
  body: "Guardian checked your stuff — no urgent deadlines or follow-ups.",
  primaryCta: "Tell Guardian something new",
  secondaryCta: "Review History",
} as const;
