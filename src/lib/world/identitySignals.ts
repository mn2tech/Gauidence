/**
 * Pure identity signal helpers (testable without DB).
 */

import {
  isAmbiguousPersonName,
  nameSimilarity,
  normalizeEntityName,
} from "@/lib/semantic/normalize";
import type { WorldIdentityBand } from "./types";

export function extractEmailFromCandidate(args: {
  attributes?: Record<string, unknown>;
  aliases?: string[];
}): string | null {
  const attrs = args.attributes ?? {};
  const raw =
    (typeof attrs.email === "string" && attrs.email) ||
    (typeof attrs.Email === "string" && attrs.Email) ||
    null;
  if (raw) return raw.trim().toLowerCase();
  const fromAlias = (args.aliases ?? []).find((a) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.trim())
  );
  return fromAlias?.trim().toLowerCase() ?? null;
}

export function extractPhoneFromCandidate(args: {
  attributes?: Record<string, unknown>;
}): string | null {
  const attrs = args.attributes ?? {};
  const raw =
    (typeof attrs.phone === "string" && attrs.phone) ||
    (typeof attrs.Phone === "string" && attrs.Phone) ||
    null;
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

export type IdentityMatchSignal =
  | { kind: "email"; confidence: number }
  | { kind: "phone"; confidence: number }
  | { kind: "exact_name"; confidence: number }
  | { kind: "alias"; confidence: number }
  | { kind: "name_org"; confidence: number }
  | { kind: "fuzzy"; confidence: number }
  | { kind: "ambiguous"; confidence: number }
  | { kind: "none"; confidence: number };

/**
 * Classify band from the strongest identity signal (no DB).
 * Used by tests and as documentation of HIGH/MEDIUM/LOW policy.
 */
export function bandFromIdentitySignal(
  signal: IdentityMatchSignal,
  entityType: string
): WorldIdentityBand {
  switch (signal.kind) {
    case "email":
    case "phone":
    case "exact_name":
    case "alias":
    case "name_org":
      return "high";
    case "fuzzy":
      // People never auto-merge on fuzzy alone
      if (entityType === "person") return "medium";
      return signal.confidence >= 0.92 ? "high" : "medium";
    case "ambiguous":
      return "low";
    case "none":
      return "high"; // create new
  }
}

/**
 * Decide whether two person mentions should auto-resolve (HIGH) given signals.
 */
export function shouldAutoResolvePeople(args: {
  nameA: string;
  nameB: string;
  emailA?: string | null;
  emailB?: string | null;
  phoneA?: string | null;
  phoneB?: string | null;
  orgA?: string | null;
  orgB?: string | null;
}): { resolve: boolean; band: WorldIdentityBand; reason: string } {
  if (
    args.emailA &&
    args.emailB &&
    args.emailA.toLowerCase() === args.emailB.toLowerCase()
  ) {
    return { resolve: true, band: "high", reason: "exact_email" };
  }
  if (args.phoneA && args.phoneB && args.phoneA === args.phoneB) {
    return { resolve: true, band: "high", reason: "exact_phone" };
  }

  const na = normalizeEntityName(args.nameA);
  const nb = normalizeEntityName(args.nameB);
  if (na && na === nb && !isAmbiguousPersonName(args.nameA)) {
    return { resolve: true, band: "high", reason: "exact_name" };
  }

  const sim = nameSimilarity(args.nameA, args.nameB);
  if (
    sim >= 0.9 &&
    args.orgA &&
    args.orgB &&
    normalizeEntityName(args.orgA) === normalizeEntityName(args.orgB)
  ) {
    return { resolve: true, band: "high", reason: "name_org" };
  }

  if (isAmbiguousPersonName(args.nameA) || isAmbiguousPersonName(args.nameB)) {
    return { resolve: false, band: "low", reason: "ambiguous_name" };
  }

  if (sim >= 0.75) {
    return { resolve: false, band: "medium", reason: "fuzzy_needs_confirm" };
  }

  return { resolve: false, band: "high", reason: "distinct" };
}
