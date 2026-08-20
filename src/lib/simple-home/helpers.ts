import {
  isFamilyMemberType,
  isOrgStyleProfile,
  type GuardianProfileType,
} from "@/lib/profiles/types";

export type SimpleHomeProfileCategory =
  | "personal"
  | "business"
  | "client"
  | "family";

const RECENT_VAULTS_KEY = "guardian:recent-vault-ids";

export function simpleHomeProfileCategory(
  type: GuardianProfileType
): SimpleHomeProfileCategory {
  if (type === "client") return "client";
  if (isOrgStyleProfile(type)) return "business";
  if (
    type === "family" ||
    isFamilyMemberType(type) ||
    type === "teacher"
  ) {
    return "family";
  }
  return "personal";
}

export function timeOfDayGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17) return "Good evening";
  return "You're up late";
}

/** First name for greetings, or null when unavailable. */
export function greetingFirstName(
  accountName: string,
  activeDisplayName?: string | null
): string | null {
  const name = greetingName(accountName, activeDisplayName);
  return name === "there" ? null : name;
}

export function greetingName(
  accountName: string,
  activeDisplayName?: string | null
): string {
  const account = accountName.trim();
  if (account && account !== "You") return account.split(/\s+/)[0] ?? account;
  const vault = activeDisplayName?.trim();
  if (vault) return vault.split(/\s+/)[0] ?? vault;
  return "there";
}

export function readRecentVaultIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_VAULTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function recordVaultAccess(profileId: string): void {
  if (typeof window === "undefined" || !profileId) return;
  const next = [
    profileId,
    ...readRecentVaultIds().filter((id) => id !== profileId),
  ].slice(0, 10);
  try {
    window.localStorage.setItem(RECENT_VAULTS_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota errors.
  }
}

export type SimpleHomeActivityItem = {
  id: string;
  kind: "document" | "note" | "vault" | "gideon";
  title: string;
  occurredAt: string;
  href: string;
};

export function formatActivityWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
