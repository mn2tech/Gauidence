import "server-only";

import OpenAI from "openai";
import type { DocumentType } from "./types";
import type { ExtractionResult, PageImage } from "./extract";
import type { ParsedInvoiceAnchors } from "./invoiceText";
import type { AnalysisInputMode } from "./inputMode";

/** Default chat model (text + vision capable). Override with OPENAI_MODEL. */
export const ANALYSIS_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

/**
 * Model used for visual/multimodal document understanding.
 * Defaults to gpt-4o (stronger layout/digit fidelity than mini).
 * Override with OPENAI_VISUAL_MODEL or fall back to OPENAI_MODEL.
 */
export const VISUAL_ANALYSIS_MODEL =
  process.env.OPENAI_VISUAL_MODEL ??
  process.env.OPENAI_MODEL ??
  "gpt-4o";

export type FilePayload = {
  mimeType: string;
  fileName: string;
  base64: string;
  /** Native extracted text (optional supplement for visual / primary for text mode). */
  extractedText?: string;
  extraction?: ExtractionResult;
  pageImages?: PageImage[];
  /** Deterministic anchors parsed from high-quality native text only. */
  invoiceAnchors?: ParsedInvoiceAnchors | null;
  /** How content should be sent to OpenAI. */
  inputMode?: AnalysisInputMode;
};

export type UserContext = {
  fullName?: string | null;
  email?: string | null;
  companyName?: string | null;
  timeZone?: string | null;
};

function appendPageImages(
  parts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
  images: PageImage[],
  maxPages: number
) {
  for (const img of images.slice(0, maxPages)) {
    parts.push({ type: "text", text: `--- Page ${img.page} (visual) ---` });
    parts.push({
      type: "image_url",
      image_url: { url: img.dataUrl, detail: "high" },
    });
  }
}

/**
 * Build multimodal user content for chat.completions.create.
 *
 * visual: prefer high-res page images (or original image). Optional short native
 *   text as a hint only — never text-only for structured visual docs.
 * text: native text only when reliable.
 * hybrid: native text + up to 2 page images for tables/ambiguous layout.
 *
 * API: OpenAI Chat Completions (openai.chat.completions.create) with
 * response_format json_schema (strict). Content parts: text | image_url | file.
 */
export function buildFileContent(
  file: FilePayload,
  instruction: string
): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  const mode: AnalysisInputMode = file.inputMode ?? "visual";
  const quality = file.extraction?.quality ?? 0;
  const text = (file.extractedText ?? "").trim();
  const images = file.pageImages?.length
    ? file.pageImages
    : file.extraction?.pageImages ?? [];

  if (mode === "text" && text && quality >= 0.45) {
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

  if (mode === "hybrid" && text && quality >= 0.45) {
    const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      {
        type: "text",
        text: `${instruction}

Analyze using the document text below. Also inspect the attached page image(s) for tables, forms, stamps, and any values that may be ambiguous in plain text.

--- DOCUMENT TEXT ---
${text.slice(0, 12000)}
--- END DOCUMENT TEXT ---`,
      },
    ];
    if (images.length > 0) {
      appendPageImages(parts, images, 2);
    }
    return parts;
  }

  // visual (default for structured docs)
  const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `${instruction}

Analyze the attached visual document page(s). Read tables row-by-row.
Preserve every digit exactly (do not drop digits). Preserve leading zeros.
Keep CONTRACTOR | HOURS | RATE | AMOUNT (or equivalent) columns aligned per row.
Prefer explicitly labeled dates; do not invent or recalculate dates.
Extract every visible line-item row.`,
    },
  ];

  if (text && quality >= 0.45) {
    parts.push({
      type: "text",
      text: `Optional native text layer (secondary; trust the visuals if they conflict):\n${text.slice(0, 6000)}`,
    });
  }

  if (images.length > 0) {
    appendPageImages(parts, images, 4);
    return parts;
  }

  // Original image upload
  if (file.mimeType.startsWith("image/")) {
    parts.push({
      type: "image_url",
      image_url: {
        url: `data:${file.mimeType};base64,${file.base64}`,
        detail: "high",
      },
    });
    return parts;
  }

  // PDF without rendered pages — SDK supports file content parts
  if (file.mimeType === "application/pdf") {
    parts.push({
      type: "file",
      file: {
        filename: file.fileName,
        file_data: `data:${file.mimeType};base64,${file.base64}`,
      },
    });
    return parts;
  }

  return parts;
}

export function modelForInputMode(mode: AnalysisInputMode | undefined): string {
  if (mode === "text") return ANALYSIS_MODEL;
  return VISUAL_ANALYSIS_MODEL;
}

export async function runStructuredJson<T>(
  openai: OpenAI,
  args: {
    system: string;
    userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    schemaName: string;
    schema: Record<string, unknown>;
    /** Defaults from input mode / ANALYSIS_MODEL. */
    model?: string;
  }
): Promise<T> {
  const completion = await openai.chat.completions.create({
    model: args.model ?? ANALYSIS_MODEL,
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
