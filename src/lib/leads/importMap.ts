import type { LeadImportField } from "@/lib/leads/importTypes";

const HEADER_ALIASES: Record<LeadImportField, string[]> = {
  company: [
    "company",
    "company name",
    "business",
    "business name",
    "organization",
    "org",
    "employer",
  ],
  contact: [
    "contact",
    "contact name",
    "name",
    "full name",
    "person",
    "first name",
    "contact person",
  ],
  title: ["title", "job title", "position", "role"],
  email: ["email", "e-mail", "email address"],
  phone: ["phone", "telephone", "mobile", "cell", "phone number"],
  website: ["website", "web", "url", "site", "domain"],
  notes: ["notes", "note", "comments", "description", "memo"],
  source: ["source", "lead source", "origin"],
};

export function suggestColumnMapping(headers: string[]): Partial<Record<LeadImportField, number>> {
  const mapping: Partial<Record<LeadImportField, number>> = {};
  const normalized = headers.map((h) => h.trim().toLowerCase());

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [
    LeadImportField,
    string[],
  ][]) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0 && mapping[field] === undefined) {
      mapping[field] = idx;
    }
  }

  return mapping;
}

export function mapRowToLead(
  row: string[],
  mapping: Partial<Record<LeadImportField, number>>
): {
  companyName: string | null;
  contactName: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  source: string | null;
} {
  const cell = (field: LeadImportField): string | null => {
    const idx = mapping[field];
    if (idx == null || idx < 0 || idx >= row.length) return null;
    const v = row[idx]?.trim();
    return v ? v : null;
  };

  return {
    companyName: cell("company"),
    contactName: cell("contact"),
    jobTitle: cell("title"),
    email: cell("email"),
    phone: cell("phone"),
    website: cell("website"),
    notes: cell("notes"),
    source: cell("source"),
  };
}
