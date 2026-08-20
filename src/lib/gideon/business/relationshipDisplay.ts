/**
 * Relationship display helpers for Business Intelligence (no server-only).
 */

import { formatRelationshipProse } from "@/lib/gideon/evidenceBoundaries";

const NOISY_REL_TYPES = /^(MENTIONED_IN|EXTRACTED_FROM|APPEARS_IN|DERIVED_FROM|FOUND_IN)$/i;

const REL_TYPE_ALIASES: Record<string, string> = {
  SERVICES: "SERVES",
  PROVIDES_SERVICE_TO: "SERVES",
  SERVICE_FOR: "SERVES",
  CLIENT_OF: "SERVES",
};

export type RelationshipDisplayRow = {
  type: string;
  relatedName: string;
  relatedType: string;
  direction: "outgoing" | "incoming";
  relatedId: string;
  relationshipId: string;
  confidence: number;
};

export function normalizeRelationshipType(type: string): string {
  const upper = type.trim().toUpperCase();
  return REL_TYPE_ALIASES[upper] ?? upper;
}

export function compactEntityKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function isNoisyRelationshipTarget(args: {
  name: string;
  entityType: string;
  relationshipType: string;
}): boolean {
  if (NOISY_REL_TYPES.test(args.relationshipType)) return true;
  if (/^(document|file|chunk|source|attachment)$/i.test(args.entityType)) {
    return true;
  }
  if (/\.(txt|pdf|docx?|md|csv|xlsx?)$/i.test(args.name)) return true;
  if (/^pasted\b/i.test(args.name.trim())) return true;
  if (/\bjob description\b/i.test(args.name)) return true;
  return false;
}

/**
 * Prefer one edge when SERVICES/SERVES collide or project titles are near-duplicates.
 */
export function dedupeRelationshipRows(
  rows: RelationshipDisplayRow[]
): RelationshipDisplayRow[] {
  const byTypeAndTarget = new Map<string, RelationshipDisplayRow>();

  for (const row of rows) {
    const type = normalizeRelationshipType(row.type);
    const key = `${type}::${compactEntityKey(row.relatedName)}`;
    const existing = byTypeAndTarget.get(key);
    if (!existing) {
      byTypeAndTarget.set(key, { ...row, type });
      continue;
    }
    // Prefer higher confidence, then longer (more specific) related name
    if (
      row.confidence > existing.confidence ||
      (row.confidence === existing.confidence &&
        row.relatedName.length > existing.relatedName.length)
    ) {
      byTypeAndTarget.set(key, { ...row, type });
    }
  }

  // Collapse near-duplicate project/org names under the same relationship type
  // e.g. "Enterprise Data Warehouse Migration" vs "... from Oracle to Cloud"
  const collapsed: RelationshipDisplayRow[] = [];
  for (const row of byTypeAndTarget.values()) {
    const rowKey = compactEntityKey(row.relatedName);
    const betterIdx = collapsed.findIndex((other) => {
      if (normalizeRelationshipType(other.type) !== row.type) return false;
      const otherKey = compactEntityKey(other.relatedName);
      return (
        otherKey.includes(rowKey) ||
        rowKey.includes(otherKey) ||
        (rowKey.length >= 12 &&
          otherKey.length >= 12 &&
          (otherKey.startsWith(rowKey.slice(0, 12)) ||
            rowKey.startsWith(otherKey.slice(0, 12))))
      );
    });
    if (betterIdx < 0) {
      collapsed.push(row);
      continue;
    }
    const other = collapsed[betterIdx]!;
    if (
      row.relatedName.length > other.relatedName.length ||
      row.confidence > other.confidence
    ) {
      collapsed[betterIdx] = row;
    }
  }

  const priority = (type: string) => {
    if (/^SERVES$/i.test(type)) return 0;
    if (/^HAS_PROJECT|WORKS_ON$/i.test(type)) return 1;
    if (/^OWNS|EMPLOYS|CONTACT_FOR$/i.test(type)) return 2;
    return 3;
  };

  return collapsed.sort((a, b) => {
    const pd = priority(a.type) - priority(b.type);
    if (pd !== 0) return pd;
    return a.relatedName.localeCompare(b.relatedName);
  });
}

export function formatEntityRelationshipsAnswer(
  entityName: string,
  rows: RelationshipDisplayRow[]
): string[] {
  if (!rows.length) {
    return [
      `Based on the information currently available in this Space, Guardian does not show ontology relationships for ${entityName} yet.`,
    ];
  }

  const serves = rows.filter((r) => /^SERVES$/i.test(r.type));
  const projects = rows.filter((r) =>
    /^(HAS_PROJECT|WORKS_ON|OWNS)$/i.test(r.type)
  );
  const other = rows.filter(
    (r) =>
      !/^SERVES$/i.test(r.type) &&
      !/^(HAS_PROJECT|WORKS_ON|OWNS)$/i.test(r.type)
  );

  const lines: string[] = [
    `${entityName} connects to the following based on Guardian's knowledge in this Space:`,
  ];

  if (serves.length) {
    lines.push("");
    lines.push(
      `${entityName} offers or relates to: ${serves
        .slice(0, 8)
        .map((r) => r.relatedName)
        .join(", ")}.`
    );
  }

  if (projects.length) {
    lines.push("");
    lines.push("Projects and assets");
    const seen = new Set<string>();
    for (const r of projects.slice(0, 10)) {
      const key = compactEntityKey(r.relatedName);
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`• ${r.relatedName}`);
    }
  }

  if (other.length) {
    lines.push("");
    lines.push("Other connections");
    for (const r of other.slice(0, 6)) {
      lines.push(
        `• ${formatRelationshipProse({
          subject: entityName,
          type: r.type,
          related: r.relatedName,
          direction: r.direction,
        })}`
      );
    }
  }

  return lines;
}
