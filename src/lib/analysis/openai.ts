import "server-only";

import OpenAI from "openai";
import type { DocumentType } from "./types";

export const ANALYSIS_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export type FilePayload = {
  mimeType: string;
  fileName: string;
  base64: string;
};

export type UserContext = {
  fullName?: string | null;
  email?: string | null;
  companyName?: string | null;
  timeZone?: string | null;
};

export function buildFileContent(
  file: FilePayload,
  instruction: string
): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  const dataUrl = `data:${file.mimeType};base64,${file.base64}`;
  if (file.mimeType === "application/pdf") {
    return [
      { type: "text", text: instruction },
      { type: "file", file: { filename: file.fileName, file_data: dataUrl } },
    ];
  }
  return [
    { type: "text", text: instruction },
    { type: "image_url", image_url: { url: dataUrl } },
  ];
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
