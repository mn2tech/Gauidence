import "server-only";

import {
  createLlmClient,
  runChatCompletion,
  ANALYSIS_MODEL,
} from "@/lib/analysis/llm";

export type SummitExtractionResult = {
  sessionTitle: string | null;
  organizations: { name: string; description?: string }[];
  speakers: { name: string; title?: string; organization?: string }[];
  notes: string[];
  rawText: string;
};

const EXTRACT_SYSTEM = `You extract structured summit intelligence from photos, screenshots, or presentation slides.

Return JSON only with this shape:
{
  "sessionTitle": string | null,
  "organizations": [{ "name": string, "description": string | null }],
  "speakers": [{ "name": string, "title": string | null, "organization": string | null }],
  "notes": [string],
  "rawText": string
}

Rules:
- Extract only text visibly present in the image.
- Do not invent email addresses, phone numbers, contract vehicles, or opportunities.
- If uncertain, leave fields null or empty.
- Mark extracted items as proposed — they require owner review before publication.`;

export async function extractSummitIntelligenceFromText(
  visibleText: string
): Promise<SummitExtractionResult> {
  const client = createLlmClient();
  const raw = await runChatCompletion(client, {
    system: EXTRACT_SYSTEM,
    model: ANALYSIS_MODEL,
    maxTokens: 1200,
    messages: [
      {
        role: "user",
        content: `Extract summit intelligence from this visible text:\n\n${visibleText.slice(0, 8000)}`,
      },
    ],
  });

  try {
    const parsed = JSON.parse(raw) as SummitExtractionResult;
    return {
      sessionTitle: parsed.sessionTitle ?? null,
      organizations: Array.isArray(parsed.organizations) ? parsed.organizations : [],
      speakers: Array.isArray(parsed.speakers) ? parsed.speakers : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      rawText: parsed.rawText ?? visibleText.slice(0, 4000),
    };
  } catch {
    return {
      sessionTitle: null,
      organizations: [],
      speakers: [],
      notes: [],
      rawText: visibleText.slice(0, 4000),
    };
  }
}

export async function extractSummitIntelligenceFromImage(
  imageBase64: string,
  mimeType: string
): Promise<SummitExtractionResult> {
  const client = createLlmClient();
  const raw = await runChatCompletion(client, {
    system: EXTRACT_SYSTEM,
    model: ANALYSIS_MODEL,
    maxTokens: 1200,
    attachedImage: {
      mimeType,
      base64: imageBase64,
      fileName: "summit-capture.jpg",
    },
    messages: [
      {
        role: "user",
        content:
          "Extract summit intelligence from this image. Return JSON only.",
      },
    ],
  });

  try {
    const parsed = JSON.parse(raw) as SummitExtractionResult;
    return {
      sessionTitle: parsed.sessionTitle ?? null,
      organizations: Array.isArray(parsed.organizations) ? parsed.organizations : [],
      speakers: Array.isArray(parsed.speakers) ? parsed.speakers : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      rawText: parsed.rawText ?? "",
    };
  } catch {
    return {
      sessionTitle: null,
      organizations: [],
      speakers: [],
      notes: [],
      rawText: "",
    };
  }
}
