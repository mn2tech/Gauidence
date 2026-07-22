/** Keys for welcome and re-engagement emails (one send per user per key). */

export const RETENTION_EMAIL_KEYS = [
  "welcome",
  "nudge_no_vault",
  "nudge_no_document",
  "nudge_try_gideon",
] as const;

export type RetentionEmailKey = (typeof RETENTION_EMAIL_KEYS)[number];

export type UserActivitySnapshot = {
  hasVault: boolean;
  hasDocument: boolean;
  hasAskedGideon: boolean;
  hasResearch: boolean;
};

/** Minimum account age (hours) before each email may send. */
export const RETENTION_MIN_AGE_HOURS: Record<RetentionEmailKey, number> = {
  welcome: 0,
  nudge_no_vault: 24,
  nudge_no_document: 72,
  nudge_try_gideon: 168,
};
