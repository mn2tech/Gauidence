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
  const q = question.trim();
  // "What do you see in this image?" is describing one photo, not a gallery.
  if (/\bwhat do you see\b/i.test(q)) return false;
  if (
    /\bdescribe\b.{0,48}\b(this|the)\s+(image|photo|picture|pic|scene)\b/i.test(q)
  ) {
    return false;
  }
  // Bare "see" + singular "image" falsely matches describe-this-photo prompts.
  return (
    /\b(show|view|display|look at|open)\b.{0,40}\b(pic(ture)?s?|photos?|images?|scans?|flyers?)\b/i.test(
      q
    ) ||
    /\bsee\b.{0,40}\b(pics|pictures|photos|images)\b/i.test(q) ||
    /\b(pic(ture)?s?|photos?|images?|flyers?)\b.{0,20}\b(show|see|view|display)\b/i.test(
      q
    )
  );
}

/** User is asking about one specific image (not a gallery). */
export function wantsSingleImageFocus(question: string): boolean {
  return /\b(this|the)\s+(photo|image|picture|pic|scan|flyer)\b|\b\w+\s+(camp\s+)?flyer\b/i.test(
    question
  );
}
