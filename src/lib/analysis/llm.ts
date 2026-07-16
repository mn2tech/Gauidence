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

export class AnalysisLlmError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 502, code = "llm_error") {
    super(message);
    this.name = "AnalysisLlmError";
    this.status = status;
    this.code = code;
  }
}

export function createLlmClient(): LlmClient {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new AnalysisLlmError(
      "AI analysis isn't set up yet. Add ANTHROPIC_API_KEY on this deployment.",
      503,
      "missing_api_key"
    );
  }
  // The SDK defaults to two retries. Visual analysis makes two sequential
  // Claude calls (classification + specialist), so brief 5xx/529 incidents
  // otherwise surface too often as a failed document. The analyze route has a
  // 120s budget; four retries remain within it when overloads fail quickly.
  return new Anthropic({ apiKey, maxRetries: 4, timeout: 45_000 });
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

function mapAnthropicError(err: unknown): never {
  if (err instanceof AnalysisLlmError) throw err;
  if (err instanceof Anthropic.APIError) {
    // Safe operational diagnostics only: never log prompts or document data.
    console.error("Anthropic analysis request failed", {
      status: err.status,
      name: err.name,
      requestId: err.requestID,
      message: (err.message || "").slice(0, 240),
    });
    if (err.status === 401 || err.status === 403) {
      throw new AnalysisLlmError(
        "Claude rejected the API key. Check ANTHROPIC_API_KEY in Vercel.",
        502,
        "auth"
      );
    }
    if (err.status === 429) {
      throw new AnalysisLlmError(
        "Claude rate limit reached. Please try again in a minute.",
        429,
        "rate_limit"
      );
    }
    if (err.status === 500 || err.status === 529) {
      throw new AnalysisLlmError(
        "Claude is temporarily busy. Please try this document again in a moment.",
        503,
        "overloaded"
      );
    }
    if (err.status === 400) {
      const detail = (err.message || "").slice(0, 200);
      throw new AnalysisLlmError(
        `Claude could not process this analysis request.${detail ? ` (${detail})` : ""}`,
        502,
        "bad_request"
      );
    }
    throw new AnalysisLlmError(
      "The Claude service couldn't analyze this document. Please try again.",
      502,
      "api_error"
    );
  }
  throw new AnalysisLlmError(
    "The AI service couldn't analyze this document. Please try again.",
    502,
    "unknown"
  );
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("No JSON object in model response");
  }
}

/**
 * Structured extraction via Claude Messages API.
 * Tries native json_schema output first; falls back to prompted JSON if the
 * schema is too complex for Claude's grammar compiler.
 */
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
  const model = args.model ?? ANALYSIS_MODEL;

  try {
    const response = await client.messages.parse({
      model,
      max_tokens: 8192,
      temperature: 0,
      system: args.system,
      messages: [{ role: "user", content: args.userContent }],
      output_config: {
        // Allow SDK transform — our OpenAI-era schemas use type unions Claude may rewrite
        format: jsonSchemaOutputFormat(
          args.schema as Parameters<typeof jsonSchemaOutputFormat>[0]
        ),
      },
    });

    if (response.parsed_output != null) {
      return response.parsed_output as T;
    }
    const textBlock = response.content.find((b) => b.type === "text");
    if (textBlock && textBlock.type === "text") {
      return extractJsonObject(textBlock.text) as T;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const tooComplex =
      /too complex|compilation|union types|optional parameters/i.test(msg) ||
      (err instanceof Anthropic.APIError && err.status === 400);

    if (!tooComplex) {
      mapAnthropicError(err);
    }
    // Fall through to prompted JSON
  }

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      temperature: 0,
      system: `${args.system}

You MUST respond with a single JSON object only (no markdown fences, no prose).
The JSON must match this schema name "${args.schemaName}" and shape:
${JSON.stringify(args.schema)}`,
      messages: [{ role: "user", content: args.userContent }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new AnalysisLlmError(
        "Claude returned an empty analysis response.",
        502,
        "empty_response"
      );
    }
    return extractJsonObject(textBlock.text) as T;
  } catch (err) {
    mapAnthropicError(err);
  }
}

export async function runPlainText(
  client: LlmClient,
  args: {
    system: string;
    userContent: ContentPart[];
    model?: string;
  }
): Promise<string> {
  try {
    const response = await client.messages.create({
      model: args.model ?? ANALYSIS_MODEL,
      max_tokens: 8192,
      temperature: 0,
      system: args.system,
      messages: [{ role: "user", content: args.userContent }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
  } catch (err) {
    mapAnthropicError(err);
  }
}

/** Multi-turn chat for Ask-your-document (text-only messages). */
export async function runChatCompletion(
  client: LlmClient,
  args: {
    system: string;
    messages: { role: "user" | "assistant"; content: string }[];
    model?: string;
    maxTokens?: number;
  }
): Promise<string> {
  try {
    const response = await client.messages.create({
      model: args.model ?? ANALYSIS_MODEL,
      max_tokens: args.maxTokens ?? 2048,
      temperature: 0,
      system: args.system,
      messages: args.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
  } catch (err) {
    mapAnthropicError(err);
  }
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

export function createAnalysisClient(): LlmClient {
  return createLlmClient();
}
