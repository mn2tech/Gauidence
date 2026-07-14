/** Fixed document categories, shared by the vault UI and the AI analyze route. */
export const DOCUMENT_CATEGORIES = [
  "Family",
  "Business",
  "Insurance",
  "Medical",
  "Legal",
  "Financial",
  "Taxes",
  "Identity",
  "Home",
  "Vehicle",
  "Education",
  "Employment",
  "Other",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export function isDocumentCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}
