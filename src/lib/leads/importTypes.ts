export type LeadImportField =
  | "company"
  | "contact"
  | "firstName"
  | "lastName"
  | "title"
  | "email"
  | "phone"
  | "website"
  | "notes"
  | "source";

export const LEAD_IMPORT_FIELDS: LeadImportField[] = [
  "company",
  "contact",
  "firstName",
  "lastName",
  "title",
  "email",
  "phone",
  "website",
  "notes",
  "source",
];

export const LEAD_IMPORT_FIELD_LABELS: Record<LeadImportField, string> = {
  company: "Company",
  contact: "Contact (full name)",
  firstName: "First name",
  lastName: "Last name",
  title: "Title",
  email: "Email",
  phone: "Phone",
  website: "Website",
  notes: "Notes",
  source: "Source",
};

export type ParsedImportSheet = {
  headers: string[];
  rows: string[][];
  totalRows: number;
};

export const MAX_IMPORT_ROWS = 500;
