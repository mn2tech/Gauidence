import "server-only";

import type OpenAI from "openai";
import { ANALYSIS_MODEL } from "./openai";
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

/**
 * Vision OCR when native PDF text is missing/poor.
 * Prefers rendered page images over raw PDF binary (more reliable digit retention).
 */
export async function transcribeDocument(args: {
  openai: OpenAI;
  fileName: string;
  mimeType: string;
  base64: string;
  pageImages: PageImage[];
}): Promise<{ text: string; quality: number; issues: string[]; method: "vision_ocr" }> {
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Transcribe this document (${args.fileName}) verbatim. Preserve invoice table columns and all digits.`,
    },
  ];

  if (args.pageImages.length > 0) {
    for (const img of args.pageImages) {
      content.push({
        type: "text",
        text: `--- Page ${img.page} ---`,
      });
      content.push({
        type: "image_url",
        image_url: { url: img.dataUrl, detail: "high" },
      });
    }
  } else if (args.mimeType === "application/pdf") {
    content.push({
      type: "file",
      file: {
        filename: args.fileName,
        file_data: `data:${args.mimeType};base64,${args.base64}`,
      },
    });
  } else {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${args.mimeType};base64,${args.base64}`,
        detail: "high",
      },
    });
  }

  const completion = await args.openai.chat.completions.create({
    model: ANALYSIS_MODEL,
    messages: [
      { role: "system", content: OCR_SYSTEM },
      { role: "user", content },
    ],
    temperature: 0,
  });

  const text = (completion.choices[0]?.message?.content ?? "").trim();
  const report = assessExtractionQuality(text);
  return {
    text,
    quality: report.score,
    issues: report.issues,
    method: "vision_ocr",
  };
}
