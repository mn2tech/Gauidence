import {
  RETENTION_EMAIL_KEYS,
  RETENTION_MIN_AGE_HOURS,
  type RetentionEmailKey,
  type UserActivitySnapshot,
} from "@/lib/retention/types";

export function accountAgeHours(createdAtIso: string, now = Date.now()): number {
  const created = Date.parse(createdAtIso);
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, (now - created) / 3_600_000);
}

/**
 * Whether a retention email should send for this user right now.
 */
export function isEligibleForRetentionEmail(
  key: RetentionEmailKey,
  accountAgeHrs: number,
  activity: UserActivitySnapshot,
  alreadySent: ReadonlySet<RetentionEmailKey>
): boolean {
  if (alreadySent.has(key)) return false;
  if (accountAgeHrs < RETENTION_MIN_AGE_HOURS[key]) return false;

  switch (key) {
    case "welcome":
      return true;
    case "nudge_no_vault":
      return !activity.hasVault;
    case "nudge_no_document":
      return activity.hasVault && !activity.hasDocument;
    case "nudge_try_gideon":
      return (
        activity.hasDocument &&
        !activity.hasAskedGideon &&
        !activity.hasResearch
      );
    default:
      return false;
  }
}

/** Order to evaluate sends (welcome first, then escalating nudges). */
export function retentionEmailsToTry(
  accountAgeHrs: number,
  activity: UserActivitySnapshot,
  alreadySent: ReadonlySet<RetentionEmailKey>
): RetentionEmailKey[] {
  return RETENTION_EMAIL_KEYS.filter((key) =>
    isEligibleForRetentionEmail(key, accountAgeHrs, activity, alreadySent)
  );
}
