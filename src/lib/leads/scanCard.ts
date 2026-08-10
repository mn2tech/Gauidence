import "server-only";

import {
  CHAT_MODEL,
  createLlmClient,
  runChatCompletion,
  VISUAL_ANALYSIS_MODEL,
} from "@/lib/analysis/llm";
import { isChatLlmConfigured } from "@/lib/analysis/chatProvider";
import { withLlmUsage } from "@/lib/usage/record";

import type { ExtractedBusinessCard } from "@/lib/leads/types";

export type { ExtractedBusinessCard };

export const BUSINESS_CARD_SCAN_SYSTEM = `You extract contact information from business card images.

Return strict JSON only (no markdown fences) with this shape:
{
  "contactName": string | null,
  "companyName": string | null,
  "jobTitle": string | null,
  "email": string | null,
  "phone": string | null,
  "website": string | null,
  "address": string | null
}

Rules:
- Only include fields you can read from the card. Use null when unclear or missing.
- Do not invent information.
- Phone numbers: preserve formatting when visible.
- Website: domain or URL as shown on the card.
- If the image is not a business card, still return null fields.`;

function parseExtracted(raw: string): ExtractedBusinessCard {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : trimmed;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const str = (key: string) => {
      const v = parsed[key];
      if (typeof v !== "string" || !v.trim()) return null;
      return v.trim();
    };
    return {
      contactName: str("contactName"),
      companyName: str("companyName"),
      jobTitle: str("jobTitle"),
      email: str("email"),
      phone: str("phone"),
      website: str("website"),
      address: str("address"),
    };
  } catch {
    return {
      contactName: null,
      companyName: null,
      jobTitle: null,
      email: null,
      phone: null,
      website: null,
      address: null,
    };
  }
}

export async function extractBusinessCardFromImage(args: {
  mimeType: string;
  base64: string;
  fileName: string;
  userId: string;
}): Promise<ExtractedBusinessCard> {
  if (!isChatLlmConfigured()) {
    throw new Error("AI isn't configured on this deployment.");
  }

  const client = createLlmClient();
  const raw = await withLlmUsage({ userId: args.userId, feature: "other" }, () =>
    runChatCompletion(client, {
      system: BUSINESS_CARD_SCAN_SYSTEM,
      model: VISUAL_ANALYSIS_MODEL,
      maxTokens: 1024,
      messages: [
        {
          role: "user",
          content: "Extract all contact fields from this business card image.",
        },
      ],
      attachedImage: {
        mimeType: args.mimeType,
        base64: args.base64,
        fileName: args.fileName,
      },
    })
  );

  return parseExtracted(raw);
}
