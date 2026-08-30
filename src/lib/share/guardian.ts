import { appBaseUrl } from "@/lib/profiles/invitations";

/** Short referral code from a user id (for ?ref= tracking). */
export function guardianReferralCode(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 8).toLowerCase();
}

/** Public try link — short path that redirects to signup. */
export function guardianTryUrl(ref?: string | null): string {
  const base = `${appBaseUrl()}/try`;
  const trimmed = ref?.trim();
  if (!trimmed) return base;
  return `${base}?ref=${encodeURIComponent(trimmed)}`;
}

export const GUARDIAN_SHARE_BLURB =
  "Try Guardian — upload school or work docs, see what needs attention Today, and ask Gideon in plain language. Free to start.";
export function guardianShareMessage(url: string): string {
  return `${GUARDIAN_SHARE_BLURB}\n\n${url}`;
}
