/** Fixed document categories, shared by the vault UI and the AI analyze route. */
export const DOCUMENT_CATEGORIES = [
  "Insurance",
  "Medical",
  "Legal",
  "Financial",
  "Taxes",
  "Identity",
  "Home",
  "Vehicle",
  "Other",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export function isDocumentCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}
