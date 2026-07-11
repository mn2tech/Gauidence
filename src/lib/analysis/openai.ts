import "server-only";

import OpenAI from "openai";
import type { DocumentType } from "./types";
import type { ExtractionResult, PageImage } from "./extract";
import type { ParsedInvoiceAnchors } from "./invoiceText";

export const ANALYSIS_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export type FilePayload = {
  mimeType: string;
  fileName: string;
  base64: string;
  /** Native or OCR-extracted text (preferred for analysis). */
  extractedText?: string;
  extraction?: ExtractionResult;
  pageImages?: PageImage[];
  /** Deterministic anchors parsed from extracted text (invoice). */
  invoiceAnchors?: ParsedInvoiceAnchors | null;
};

export type UserContext = {
  fullName?: string | null;
  email?: string | null;
  companyName?: string | null;
  timeZone?: string | null;
};

/**
 * Prefer extracted text when quality is good.
 * For image-only PDFs after OCR, send text only (do not re-send PDF — causes digit loss).
 * If text is still poor, send page images (preferred) or file/vision fallback.
 */
export function buildFileContent(
  file: FilePayload,
  instruction: string
): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  const quality = file.extraction?.quality ?? 0;
  const text = (file.extractedText ?? "").trim();

  if (text && quality >= 0.45) {
    return [
      {
        type: "text",
        text: `${instruction}

--- DOCUMENT TEXT (preserve numbers, leading zeros, and table columns exactly) ---
${text}
--- END DOCUMENT TEXT ---`,
      },
    ];
  }

  const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: text
        ? `${instruction}

Partial extracted text (may be incomplete — also inspect the attached pages):\n${text.slice(0, 4000)}`
        : instruction,
    },
  ];

  const images = file.pageImages?.length
    ? file.pageImages
    : file.extraction?.pageImages ?? [];

  if (images.length > 0) {
    for (const img of images) {
      parts.push({ type: "text", text: `--- Page ${img.page} ---` });
      parts.push({
        type: "image_url",
        image_url: { url: img.dataUrl, detail: "high" },
      });
    }
    return parts;
  }

  const dataUrl = `data:${file.mimeType};base64,${file.base64}`;
  if (file.mimeType === "application/pdf") {
    parts.push({
      type: "file",
      file: { filename: file.fileName, file_data: dataUrl },
    });
    return parts;
  }
  parts.push({ type: "image_url", image_url: { url: dataUrl, detail: "high" } });
  return parts;
}

export async function runStructuredJson<T>(
  openai: OpenAI,
  args: {
    system: string;
    userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    schemaName: string;
    schema: Record<string, unknown>;
  }
): Promise<T> {
  const completion = await openai.chat.completions.create({
    model: ANALYSIS_MODEL,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.userContent },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: args.schemaName,
        strict: true,
        schema: args.schema,
      },
    },
    temperature: 0,
  });
  return JSON.parse(completion.choices[0].message.content ?? "{}") as T;
}

export function documentTypeToCategory(type: DocumentType): string {
  switch (type) {
    case "invoice":
    case "receipt":
      return "Financial";
    case "insurance":
      return "Insurance";
    case "contract":
      return "Legal";
    case "passport":
    case "drivers_license":
      return "Identity";
    case "tax_document":
      return "Taxes";
    case "warranty":
      return "Home";
    default:
      return "Other";
  }
}
