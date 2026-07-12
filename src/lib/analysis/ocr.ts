import "server-only";

import type { LlmClient, ContentPart } from "./llm";
import { ANALYSIS_MODEL, runPlainText } from "./llm";
import type { PageImage } from "./extract";
import { assessExtractionQuality } from "./extract-quality";

const OCR_SYSTEM = `You are a document transcription engine for Guardian.
Transcribe the document EXACTLY as shown. Rules:
- Copy every digit exactly. Never drop or invent digits (16128 must not become 1628; 71628 must not become 712.62 or 1628).
- Preserve leading zeros (0000016 stays 0000016).
- Preserve line breaks and reading order.
- For invoice tables, output rows as: CONTRACTOR | DESCRIPTION | HOURS | RATE | AMOUNT
- Include every line-item row. Do not omit contractors.
- Prefer explicitly labeled dates exactly as written (Date / Due).
- Do NOT calculate due dates. Do NOT summarize. Do NOT convert currency formats except to plain digits with decimals.
- Output plain text only.`;

function dataUrlToImagePart(dataUrl: string): ContentPart | null {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/i);
  if (!match) return null;
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: match[1]!.toLowerCase() as
        | "image/jpeg"
        | "image/png"
        | "image/gif"
        | "image/webp",
      data: match[2]!,
    },
  };
}

/**
 * Vision OCR when native PDF text is missing/poor and page images unavailable
 * for the primary visual specialist path.
 */
export async function transcribeDocument(args: {
  client: LlmClient;
  fileName: string;
  mimeType: string;
  base64: string;
  pageImages: PageImage[];
}): Promise<{ text: string; quality: number; issues: string[]; method: "vision_ocr" }> {
  const content: ContentPart[] = [
    {
      type: "text",
      text: `Transcribe this document (${args.fileName}) verbatim. Preserve invoice table columns and all digits.`,
    },
  ];

  if (args.pageImages.length > 0) {
    for (const img of args.pageImages) {
      content.push({ type: "text", text: `--- Page ${img.page} ---` });
      const block = dataUrlToImagePart(img.dataUrl);
      if (block) content.push(block);
    }
  } else if (args.mimeType === "application/pdf") {
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: args.base64,
      },
    });
  } else if (args.mimeType.startsWith("image/")) {
    const media =
      args.mimeType === "image/jpg" ? "image/jpeg" : args.mimeType;
    if (
      media === "image/jpeg" ||
      media === "image/png" ||
      media === "image/gif" ||
      media === "image/webp"
    ) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: media, data: args.base64 },
      });
    }
  }

  const text = await runPlainText(args.client, {
    system: OCR_SYSTEM,
    userContent: content,
    model: ANALYSIS_MODEL,
  });
  const report = assessExtractionQuality(text);
  return {
    text,
    quality: report.score,
    issues: report.issues,
    method: "vision_ocr",
  };
}
