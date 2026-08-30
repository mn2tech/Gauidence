import { PLAN_UNIT_AMOUNT_CENTS } from "@/lib/billing/plans";

/** One month of Guardian Pro credited to the referrer. */
export const REFERRAL_REWARD_CENTS = PLAN_UNIT_AMOUNT_CENTS.personal;

/** Max granted rewards per referrer per UTC calendar year. */
export const REFERRAL_MAX_PER_YEAR = 3;

/** True for personal 8-char hex referral codes (not campaign slugs). */
export function isUserReferralCode(ref: string | null | undefined): boolean {
  const trimmed = ref?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{8}$/.test(trimmed);
}

export function utcYearStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
}

export type ReferralStats = {
  grantedThisYear: number;
  totalGranted: number;
  totalCreditCents: number;
  maxPerYear: number;
  rewardCents: number;
};
