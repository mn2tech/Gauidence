/** Google Workspace MIME types that Analyze can export. */

export const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
export const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
export const GOOGLE_SLIDE_MIME = "application/vnd.google-apps.presentation";
export const GOOGLE_DRAWING_MIME = "application/vnd.google-apps.drawing";
export const GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";
export const GOOGLE_SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

const EXPORTABLE = new Set([
  GOOGLE_DOC_MIME,
  GOOGLE_SHEET_MIME,
  GOOGLE_SLIDE_MIME,
  GOOGLE_DRAWING_MIME,
]);

export function isGoogleWorkspaceMime(mimeType?: string | null): boolean {
  const mime = (mimeType ?? "").toLowerCase().trim();
  return mime.startsWith("application/vnd.google-apps.");
}

export function isGoogleDriveExportableMime(mimeType?: string | null): boolean {
  return EXPORTABLE.has((mimeType ?? "").toLowerCase().trim());
}

export function googleDriveExportMime(mimeType?: string | null): string | null {
  const mime = (mimeType ?? "").toLowerCase().trim();
  if (mime === GOOGLE_DOC_MIME) return "text/plain";
  if (mime === GOOGLE_SHEET_MIME) return "text/csv";
  if (mime === GOOGLE_SLIDE_MIME || mime === GOOGLE_DRAWING_MIME) {
    return "application/pdf";
  }
  return null;
}
