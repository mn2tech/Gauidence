/** Vault-supported image MIME types for clipboard paste. */
const CLIPBOARD_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function imageExtension(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

function screenshotFileName(mime: string): string {
  return `screenshot-${Date.now()}.${imageExtension(mime)}`;
}

function isGenericClipboardImageName(name: string): boolean {
  return /^image\.(png|jpe?g|webp)$/i.test(name);
}

function fileFromClipboardBlob(blob: File): File {
  const name =
    blob.name && !isGenericClipboardImageName(blob.name)
      ? blob.name
      : screenshotFileName(blob.type);
  if (name === blob.name) return blob;
  return new File([blob], name, { type: blob.type });
}

/** Extract the first supported vault image from clipboard data, if present. */
export function clipboardImageToFile(clipboardData: DataTransfer): File | null {
  const items = clipboardData.items;
  if (items?.length) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== "file" || !CLIPBOARD_IMAGE_TYPES.has(item.type)) continue;
      const blob = item.getAsFile();
      if (blob) return fileFromClipboardBlob(blob);
    }
  }

  const files = clipboardData.files;
  if (files?.length) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!CLIPBOARD_IMAGE_TYPES.has(file.type)) continue;
      return fileFromClipboardBlob(file);
    }
  }

  return null;
}
