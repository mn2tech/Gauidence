/**
 * Claim / evidence tracking for Gideon turns.
 */

import type { GideonClaim } from "./types";

export function parseClaimsJson(raw: unknown): GideonClaim[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizeClaim(item))
      .filter((c): c is GideonClaim => Boolean(c));
  }
  if (typeof raw === "string") {
    try {
      return parseClaimsJson(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeClaim(item: unknown): GideonClaim | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const claim = typeof row.claim === "string" ? row.claim.trim() : "";
  if (!claim) return null;
  const evidenceRaw = Array.isArray(row.evidence) ? row.evidence : [];
  const evidence = evidenceRaw
    .map((ev) => {
      if (!ev || typeof ev !== "object") return null;
      const e = ev as Record<string, unknown>;
      if (typeof e.sourceId !== "string" || typeof e.sourceType !== "string") {
        return null;
      }
      return {
        sourceId: e.sourceId,
        sourceType: e.sourceType,
        reference: typeof e.reference === "string" ? e.reference : undefined,
        label: typeof e.label === "string" ? e.label : undefined,
        href: typeof e.href === "string" ? e.href : undefined,
      };
    })
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  return {
    claim,
    evidence,
    confidence:
      typeof row.confidence === "number" ? row.confidence : undefined,
    kind:
      row.kind === "RECOMMENDATION" || row.kind === "KNOWN_FACT"
        ? row.kind
        : undefined,
  };
}

export function mergeClaims(...groups: GideonClaim[][]): GideonClaim[] {
  const out: GideonClaim[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const claim of group) {
      const key = claim.claim.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(claim);
      if (out.length >= 40) return out;
    }
  }
  return out;
}

export function formatEvidenceAnswerFromClaims(claims: GideonClaim[]): string {
  if (!claims.length) {
    return [
      "I do not have stored claim evidence from the immediately preceding answer in this chat.",
      "Ask a question about this Space first, then ask which source supports the answer.",
    ].join("\n");
  }

  const lines = [
    "These are the sources that supported the prior answer in this conversation:",
  ];
  let i = 1;
  const seen = new Set<string>();
  for (const claim of claims) {
    for (const ev of claim.evidence) {
      // Ontology-only labels without a document/proposal source are not citable files.
      if (
        ev.sourceType === "ontology_entity" &&
        !ev.href &&
        !/document|form|pdf|crs|adv/i.test(ev.label ?? "")
      ) {
        continue;
      }
      const key = `${ev.sourceType}:${ev.sourceId}:${ev.label ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const label = ev.label ?? ev.sourceType;
      const support = claim.claim.slice(0, 160);
      lines.push("");
      lines.push(`${i}. ${label}`);
      lines.push(`   Supports: ${support}`);
      if (ev.reference) lines.push(`   Reference: ${ev.reference}`);
      if (ev.href) lines.push(`   Open: ${ev.href}`);
      i += 1;
      if (i > 10) break;
    }
    if (i > 10) break;
  }

  if (i === 1) {
    return [
      "I could not identify a concrete uploaded source from the prior turn's evidence.",
      "Ask again after a document-grounded answer, or open the Source chips on that reply when present.",
    ].join("\n");
  }

  return lines.join("\n");
}
