import { randomUUID } from "node:crypto";
import {
  isProposalStatus,
  type ProposalDeliverable,
  type ProposalLineItem,
  type ProposalTimelineItem,
} from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

export function parseTitle(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function parseOptionalText(value: unknown, max = 8000): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function parseCurrency(value: unknown): string {
  if (typeof value !== "string") return "USD";
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : "USD";
}

export function parseTaxRateBps(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

export function parseLineItems(value: unknown): ProposalLineItem[] {
  if (!Array.isArray(value)) return [];
  const items: ProposalLineItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const title = parseTitle(row.title, 200);
    if (!title) continue;
    const quantity = Number(row.quantity ?? 1);
    const unitPriceCents = Number(row.unitPriceCents ?? row.unit_price_cents ?? 0);
    items.push({
      id: parseUuid(row.id) ?? randomUUID(),
      title,
      description: parseOptionalText(row.description, 2000) ?? undefined,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unitLabel:
        typeof row.unitLabel === "string"
          ? row.unitLabel.trim().slice(0, 40) || "each"
          : typeof row.unit_label === "string"
            ? row.unit_label.trim().slice(0, 40) || "each"
            : "each",
      unitPriceCents:
        Number.isFinite(unitPriceCents) && unitPriceCents >= 0
          ? Math.round(unitPriceCents)
          : 0,
      optional: Boolean(row.optional),
    });
  }
  return items;
}

export function parseTimeline(value: unknown): ProposalTimelineItem[] {
  if (!Array.isArray(value)) return [];
  const items: ProposalTimelineItem[] = [];
  let order = 0;
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const title = parseTitle(row.title, 200);
    if (!title) continue;
    items.push({
      id: parseUuid(row.id) ?? randomUUID(),
      title,
      description: parseOptionalText(row.description, 2000) ?? undefined,
      startDate:
        typeof row.startDate === "string"
          ? row.startDate
          : typeof row.start_date === "string"
            ? row.start_date
            : undefined,
      endDate:
        typeof row.endDate === "string"
          ? row.endDate
          : typeof row.end_date === "string"
            ? row.end_date
            : undefined,
      sortOrder:
        typeof row.sortOrder === "number"
          ? row.sortOrder
          : typeof row.sort_order === "number"
            ? row.sort_order
            : order++,
    });
  }
  return items.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function parseDeliverables(value: unknown): ProposalDeliverable[] {
  if (!Array.isArray(value)) return [];
  const items: ProposalDeliverable[] = [];
  let order = 0;
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const title = parseTitle(row.title, 200);
    if (!title) continue;
    items.push({
      id: parseUuid(row.id) ?? randomUUID(),
      title,
      description: parseOptionalText(row.description, 2000) ?? undefined,
      sortOrder:
        typeof row.sortOrder === "number"
          ? row.sortOrder
          : typeof row.sort_order === "number"
            ? row.sort_order
            : order++,
    });
  }
  return items.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function parseProposalStatus(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return isProposalStatus(trimmed) ? trimmed : null;
}

export function parseExpiresAt(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function parseProposalSearchQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 120);
}
