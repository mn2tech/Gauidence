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
    "account",
    "account name",
    "firm",
    "vendor",
    "client",
    "client name",
  ],
  contact: [
    "contact",
    "contact name",
    "name",
    "full name",
    "person",
    "contact person",
    "owner",
    "representative",
  ],
  firstName: ["first name", "firstname", "first", "given name"],
  lastName: ["last name", "lastname", "last", "surname", "family name"],
  title: [
    "title",
    "job title",
    "position",
    "role",
    "job",
    "job position",
  ],
  email: ["email", "e-mail", "email address", "e-mail address", "mail"],
  phone: [
    "phone",
    "telephone",
    "mobile",
    "cell",
    "phone number",
    "tel",
    "work phone",
    "office phone",
  ],
  website: ["website", "web", "url", "site", "domain", "web site"],
  notes: ["notes", "note", "comments", "description", "memo", "remarks"],
  source: ["source", "lead source", "origin", "referral"],
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

function headerMatches(field: LeadImportField, header: string): boolean {
  const h = normalizeHeader(header);
  if (!h) return false;
  return HEADER_ALIASES[field].includes(h);
}

export function suggestColumnMapping(
  headers: string[]
): Partial<Record<LeadImportField, number>> {
  const mapping: Partial<Record<LeadImportField, number>> = {};

  for (const field of Object.keys(HEADER_ALIASES) as LeadImportField[]) {
    const idx = headers.findIndex((header) => headerMatches(field, header));
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

  const firstName = cell("firstName");
  const lastName = cell("lastName");
  const contactFromParts = [firstName, lastName].filter(Boolean).join(" ").trim();
  const contactName = cell("contact") ?? (contactFromParts || null);

  return {
    companyName: cell("company"),
    contactName,
    jobTitle: cell("title"),
    email: cell("email"),
    phone: cell("phone"),
    website: cell("website"),
    notes: cell("notes"),
    source: cell("source"),
  };
}
