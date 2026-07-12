import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import type { DocumentType } from "./types";
import type { ExtractionResult, PageImage } from "./extract";
import type { ParsedInvoiceAnchors } from "./invoiceText";
import type { AnalysisInputMode } from "./inputMode";

/** Claude model for text-heavy docs. Override with CLAUDE_MODEL or ANTHROPIC_MODEL. */
export const ANALYSIS_MODEL =
  process.env.CLAUDE_MODEL ??
  process.env.ANTHROPIC_MODEL ??
  "claude-sonnet-4-5";

/**
 * Claude model for visual/multimodal document understanding.
 * Override with CLAUDE_VISUAL_MODEL; defaults to ANALYSIS_MODEL.
 */
export const VISUAL_ANALYSIS_MODEL =
  process.env.CLAUDE_VISUAL_MODEL ?? ANALYSIS_MODEL;

export type LlmClient = Anthropic;

export type ContentPart = Anthropic.Messages.ContentBlockParam;

export type FilePayload = {
  mimeType: string;
  fileName: string;
  base64: string;
  extractedText?: string;
  extraction?: ExtractionResult;
  pageImages?: PageImage[];
  invoiceAnchors?: ParsedInvoiceAnchors | null;
  inputMode?: AnalysisInputMode;
};

export type UserContext = {
  fullName?: string | null;
  email?: string | null;
  companyName?: string | null;
  timeZone?: string | null;
};

export function createLlmClient(): LlmClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  return new Anthropic({ apiKey });
}

function dataUrlToImageBlock(
  dataUrl: string
): Anthropic.Messages.ImageBlockParam | null {
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

function appendPageImages(
  parts: ContentPart[],
  images: PageImage[],
  maxPages: number
) {
  for (const img of images.slice(0, maxPages)) {
    parts.push({ type: "text", text: `--- Page ${img.page} (visual) ---` });
    const block = dataUrlToImageBlock(img.dataUrl);
    if (block) parts.push(block);
  }
}

/**
 * Build multimodal user content for Anthropic Messages API.
 *
 * visual: high-res page images (or original image / PDF document)
 * text: native extracted text only
 * hybrid: native text + limited page images
 *
 * API: anthropic.messages.parse → POST /v1/messages with output_config.format json_schema
 */
export function buildFileContent(
  file: FilePayload,
  instruction: string
): ContentPart[] {
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
    const parts: ContentPart[] = [
      {
        type: "text",
        text: `${instruction}

Analyze using the document text below. Also inspect the attached page image(s) for tables, forms, stamps, and any values that may be ambiguous in plain text.

--- DOCUMENT TEXT ---
${text.slice(0, 12000)}
--- END DOCUMENT TEXT ---`,
      },
    ];
    if (images.length > 0) appendPageImages(parts, images, 2);
    return parts;
  }

  const parts: ContentPart[] = [
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

  if (file.mimeType.startsWith("image/")) {
    const media =
      file.mimeType === "image/jpg" ? "image/jpeg" : file.mimeType;
    if (
      media === "image/jpeg" ||
      media === "image/png" ||
      media === "image/gif" ||
      media === "image/webp"
    ) {
      parts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: media,
          data: file.base64,
        },
      });
      return parts;
    }
  }

  // PDF without rendered pages — Claude document block
  if (file.mimeType === "application/pdf") {
    parts.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: file.base64,
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
  client: LlmClient,
  args: {
    system: string;
    userContent: ContentPart[];
    schemaName: string;
    schema: Record<string, unknown>;
    model?: string;
  }
): Promise<T> {
  const response = await client.messages.parse({
    model: args.model ?? ANALYSIS_MODEL,
    max_tokens: 8192,
    temperature: 0,
    system: args.system,
    messages: [
      {
        role: "user",
        content: args.userContent,
      },
    ],
    output_config: {
      // Schemas already use additionalProperties: false / strict shapes
      format: jsonSchemaOutputFormat(
        args.schema as Parameters<typeof jsonSchemaOutputFormat>[0],
        { transform: false }
      ),
    },
  });

  if (response.parsed_output != null) {
    return response.parsed_output as T;
  }

  // Fallback: parse first text block if parse helper left output untyped
  const textBlock = response.content.find((b) => b.type === "text");
  if (textBlock && textBlock.type === "text") {
    return JSON.parse(textBlock.text) as T;
  }
  return {} as T;
}

/** OCR / freeform transcription (no JSON schema). */
export async function runPlainText(
  client: LlmClient,
  args: {
    system: string;
    userContent: ContentPart[];
    model?: string;
  }
): Promise<string> {
  const response = await client.messages.create({
    model: args.model ?? ANALYSIS_MODEL,
    max_tokens: 8192,
    temperature: 0,
    system: args.system,
    messages: [{ role: "user", content: args.userContent }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
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

/** @deprecated Use createLlmClient — kept name for gradual migration. */
export function createAnalysisClient(): LlmClient {
  return createLlmClient();
}
