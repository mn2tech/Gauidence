export const VAULT_ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "text/plain": "Text",
  "application/json": "JSON",
};

export const VAULT_UNSUPPORTED_TYPE_MESSAGE =
  "That file type isn't supported. Upload a PDF, JPG, PNG, WebP, JSON, or paste text.";

/** File-picker accept string: MIME types plus extensions for Windows/empty-type files. */
export const VAULT_FILE_ACCEPT = [
  ...Object.keys(VAULT_ACCEPTED_TYPES),
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".txt",
  ".json",
].join(",");

export function resolveVaultFileMimeType(file: {
  type: string;
  name: string;
}): string {
  const direct = file.type?.trim();
  if (direct && VAULT_ACCEPTED_TYPES[direct]) return direct;

  const lower = file.name.toLowerCase();
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return direct || "";
}
