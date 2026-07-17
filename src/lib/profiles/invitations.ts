import { createHash, randomBytes } from "crypto";

export const INVITE_TTL_DAYS = 7;
export const SHAREABLE_PROFILE_TYPES = ["business", "client"] as const;

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidInviteEmail(email: string): boolean {
  const normalized = normalizeInviteEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function createInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteExpiresAt(from = new Date()): string {
  const expires = new Date(from);
  expires.setUTCDate(expires.getUTCDate() + INVITE_TTL_DAYS);
  return expires.toISOString();
}

export function appBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return configured.replace(/\/$/, "") || "https://guardian-app-delta.vercel.app";
}

export function inviteAcceptUrl(token: string): string {
  return `${appBaseUrl()}/invite/${encodeURIComponent(token)}`;
}
