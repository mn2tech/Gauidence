/**
 * Award catalog — recognition only, no points or redeemable currency.
 */

export const AWARD_KEYS = [
  "first_vault",
  "first_document",
  "photo_capture",
  "first_daily_log",
  "first_ask_gideon",
  "first_research",
  "setup_complete",
  "week_of_notes",
] as const;

export type AwardKey = (typeof AWARD_KEYS)[number];

export type AwardDefinition = {
  key: AwardKey;
  title: string;
  description: string;
  sortOrder: number;
};

export const AWARDS: AwardDefinition[] = [
  {
    key: "first_vault",
    title: "Vault creator",
    description: "Created your first person or space.",
    sortOrder: 10,
  },
  {
    key: "first_document",
    title: "Document keeper",
    description: "Added your first document to a vault.",
    sortOrder: 20,
  },
  {
    key: "photo_capture",
    title: "Photo capture",
    description: "Saved your first photo to a vault.",
    sortOrder: 30,
  },
  {
    key: "first_daily_log",
    title: "Daily chronicler",
    description: "Wrote your first Daily Log entry.",
    sortOrder: 40,
  },
  {
    key: "first_ask_gideon",
    title: "Curious mind",
    description: "Asked Gideon your first question.",
    sortOrder: 50,
  },
  {
    key: "first_research",
    title: "Researcher",
    description: "Ran your first Research brief.",
    sortOrder: 60,
  },
  {
    key: "setup_complete",
    title: "All set",
    description: "Finished the core Guardian setup steps.",
    sortOrder: 70,
  },
  {
    key: "week_of_notes",
    title: "Week of notes",
    description: "Logged seven days in a row.",
    sortOrder: 80,
  },
];

/** Awards required before granting setup_complete. */
export const SETUP_CORE_KEYS: AwardKey[] = [
  "first_vault",
  "first_document",
  "first_daily_log",
  "first_ask_gideon",
  "first_research",
];

export function awardByKey(key: AwardKey): AwardDefinition {
  const found = AWARDS.find((a) => a.key === key);
  if (!found) throw new Error(`Unknown award: ${key}`);
  return found;
}

export function isAwardKey(value: string): value is AwardKey {
  return (AWARD_KEYS as readonly string[]).includes(value);
}
