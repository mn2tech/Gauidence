import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads/types";

export function parseUuid(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    trimmed
  )
    ? trimmed
    : null;
}

export function parseOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseLeadStatus(value: unknown): LeadStatus | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  return LEAD_STATUSES.includes(normalized as LeadStatus)
    ? (normalized as LeadStatus)
    : null;
}

export function parseLeadSearchQuery(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 ? trimmed : null;
}

export function parseCompanyOrContact(
  companyName: unknown,
  contactName: unknown
): { companyName: string | null; contactName: string | null } | null {
  const company = parseOptionalText(companyName);
  const contact = parseOptionalText(contactName);
  if (!company && !contact) return null;
  return { companyName: company, contactName: contact };
}
