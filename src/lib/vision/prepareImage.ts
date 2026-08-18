import "server-only";

import type { PreparedVisionImage, VisionCompatibleMime } from "./types";
import {
  isHeicAsset,
  normalizeImageMime,
} from "./routeAsset";

const MAX_EDGE = 2048;
const MAX_BYTES = 4 * 1024 * 1024;

function asCompatibleMime(mime: string): VisionCompatibleMime | null {
  const normalized = normalizeImageMime(mime);
  if (
    normalized === "image/jpeg" ||
    normalized === "image/png" ||
    normalized === "image/gif" ||
    normalized === "image/webp"
  ) {
    return normalized;
  }
  return null;
}

async function convertHeicToJpeg(input: Buffer): Promise<Buffer> {
  const mod = await import("heic-convert");
  const convert = mod.default;
  const out = await convert({
    buffer: input,
    format: "JPEG",
    quality: 0.88,
  });
  return Buffer.from(new Uint8Array(out));
}

async function downscaleIfNeeded(
  buffer: Buffer,
  mimeType: VisionCompatibleMime
): Promise<{ buffer: Buffer; mimeType: VisionCompatibleMime }> {
  if (buffer.byteLength <= MAX_BYTES) {
    return { buffer, mimeType };
  }
  try {
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const image = await loadImage(buffer);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, width, height);
    const jpeg = canvas.toBuffer("image/jpeg", 0.82);
    return { buffer: jpeg, mimeType: "image/jpeg" };
  } catch {
    if (buffer.byteLength > MAX_BYTES) {
      throw new Error("This image is too large to analyze.");
    }
    return { buffer, mimeType };
  }
}

/**
 * Convert HEIC and oversized files into a vision-compatible JPEG/PNG/WebP.
 * The original stored asset is never replaced.
 */
export async function prepareImageForVision(args: {
  mimeType: string;
  base64: string;
  fileName: string;
}): Promise<PreparedVisionImage> {
  let mime = normalizeImageMime(args.mimeType);
  let bytes = Uint8Array.from(Buffer.from(args.base64, "base64"));
  let convertedFrom: string | undefined;

  if (isHeicAsset(mime, args.fileName)) {
    const jpeg = await convertHeicToJpeg(Buffer.from(bytes));
    bytes = Uint8Array.from(jpeg);
    convertedFrom = mime || "image/heic";
    mime = "image/jpeg";
  }

  const compatible = asCompatibleMime(mime);
  if (!compatible) {
    throw new Error("This image format can't be sent to Guardian Vision yet.");
  }

  const scaled = await downscaleIfNeeded(Buffer.from(bytes), compatible);
  return {
    mimeType: scaled.mimeType,
    base64: scaled.buffer.toString("base64"),
    fileName: args.fileName,
    convertedFrom,
  };
}
