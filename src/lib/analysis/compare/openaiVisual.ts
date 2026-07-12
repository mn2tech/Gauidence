import "server-only";

import OpenAI from "openai";
import type { GuardianAnalysis } from "../types";
import type { FilePayload, UserContext } from "../llm";
import {
  INVOICE_ANALYSIS_SCHEMA,
  INVOICE_ANALYSIS_SYSTEM,
  materializeInvoiceFromParsed,
} from "../analyzers/invoice";

export const OPENAI_VISUAL_MODEL =
  process.env.OPENAI_VISUAL_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o";

export function createOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for the OpenAI visual analyzer arm.");
  }
  return new OpenAI({ apiKey });
}

/**
 * OpenAI visual invoice analyzer — page images only (no PDF file upload).
 * Eval/compare harness; production still uses Claude.
 */
export async function analyzeInvoiceOpenAiVisual(
  client: OpenAI,
  file: FilePayload,
  user: UserContext,
  model = OPENAI_VISUAL_MODEL
): Promise<GuardianAnalysis> {
  const images = file.pageImages?.length
    ? file.pageImages
    : file.extraction?.pageImages ?? [];

  if (images.length === 0) {
    throw new Error(
      "OpenAI visual arm requires page images. Extract/render the PDF first."
    );
  }

  const content: OpenAI.Chat.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: "Analyze this invoice from the page image(s). Copy numbers exactly; do not drop digits. Include every line-item row.",
    },
  ];

  for (const img of images.slice(0, 4)) {
    content.push({
      type: "text",
      text: `--- Page ${img.page} (visual) ---`,
    });
    content.push({
      type: "image_url",
      image_url: { url: img.dataUrl, detail: "high" },
    });
  }

  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: INVOICE_ANALYSIS_SYSTEM },
      { role: "user", content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "invoice_analysis",
        strict: true,
        schema: INVOICE_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenAI visual analyzer returned an empty response.");
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return materializeInvoiceFromParsed(parsed, file, user);
}
