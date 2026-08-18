import type { VisionAssetKind } from "./types";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i;
const PDF_EXT = /\.pdf$/i;
const DOC_EXT = /\.(docx?|txt|md|rtf)$/i;

export function normalizeImageMime(mimeType: string): string {
  const mime = mimeType.trim().toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  return mime;
}

export function isImageAsset(mimeType: string, fileName?: string): boolean {
  const mime = normalizeImageMime(mimeType);
  if (mime.startsWith("image/")) return true;
  return Boolean(fileName && IMAGE_EXT.test(fileName));
}

export function isHeicAsset(mimeType: string, fileName?: string): boolean {
  const mime = normalizeImageMime(mimeType);
  if (mime === "image/heic" || mime === "image/heif") return true;
  return Boolean(fileName && /\.(heic|heif)$/i.test(fileName));
}

export function isVisionCompatibleMime(mimeType: string): boolean {
  const mime = normalizeImageMime(mimeType);
  return (
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/gif" ||
    mime === "image/webp"
  );
}

/**
 * File-type router for Guardian ingestion.
 * Images go to Guardian Vision; PDFs/docs keep the existing analyzers.
 */
export function routeAssetKind(
  mimeType: string,
  fileName?: string
): VisionAssetKind {
  const mime = normalizeImageMime(mimeType);
  if (isImageAsset(mime, fileName)) return "image";
  if (mime === "application/pdf" || (fileName && PDF_EXT.test(fileName))) {
    return "pdf";
  }
  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword" ||
    mime === "text/plain" ||
    mime === "text/markdown" ||
    (fileName && DOC_EXT.test(fileName))
  ) {
    return "document";
  }
  return "generic";
}

export function shouldAnalyzeImageWithVision(
  mimeType: string,
  fileName?: string
): boolean {
  return routeAssetKind(mimeType, fileName) === "image";
}
