import { createHash, randomBytes } from "crypto";
import { SHAREABLE_PROFILE_TYPES } from "./types";
import { getAppBaseUrl } from "@/lib/url/appBaseUrl";

export { SHAREABLE_PROFILE_TYPES };
export const INVITE_TTL_DAYS = 7;

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
  return getAppBaseUrl();
}

export function inviteAcceptUrl(token: string): string {
  return `${appBaseUrl()}/invite/${encodeURIComponent(token)}`;
}
