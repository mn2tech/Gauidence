/** Image helpers for Ask Gideon inline previews. */

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i;

export function isImageFileName(fileName: string | null | undefined): boolean {
  if (!fileName?.trim()) return false;
  return IMAGE_EXT.test(fileName.trim());
}

export function isImageMimeType(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return mime.toLowerCase().startsWith("image/");
}

/** User asked to see / show pictures rather than only describe. */
export function wantsShowPictures(question: string): boolean {
  return /\b(show|see|view|display|look at|open)\b.{0,40}\b(pic(ture)?s?|photos?|images?|scans?)\b|\b(pic(ture)?s?|photos?|images?)\b.{0,20}\b(show|see|view|display)\b/i.test(
    question
  );
}

/** User is asking about one specific image (not a gallery). */
export function wantsSingleImageFocus(question: string): boolean {
  return /\b(this|the)\s+(photo|image|picture|pic|scan)\b/i.test(question);
}
