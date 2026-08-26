import "server-only";

import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { createLlmClient, CHAT_MODEL } from "@/lib/analysis/llm";
import {
  GUARDIAN_EXTRACTION_JSON_SCHEMA,
  parseGuardianExtraction,
  type GuardianExtractionResult,
} from "./schema";

export type GuardianItemLlmInput = {
  sourceText: string;
  fileName: string;
  documentType?: string | null;
  title?: string | null;
  summary?: string | null;
  spaceName?: string | null;
  importantDates?: { label?: string; date?: string; value?: string }[] | null;
};

function buildSystemPrompt(): string {
  return `You are Guardian's Item Extraction engine.
Extract ONLY information with meaningful future or actionable value for the user.

Extract items such as:
- school closures, appointments, deadlines, payments, renewals, expirations
- forms / document requirements, follow-ups, business commitments
- events, travel, meetings, return windows, warranty dates, important reminders

Do NOT create items for low-value historical or evergreen facts such as:
- company founded in YYYY
- document generated / printed dates with no user action
- typical school week schedules ("Monday through Friday")
- marketing CTAs ("contact us today")

Rules:
- Every item MUST include a short verbatim source_excerpt from the text.
- Never invent exact dates. If the text says "next Friday" without enough context for an unambiguous calendar date, omit event_date/due_at (set null) rather than guessing.
- Use ISO dates YYYY-MM-DD when dates are explicit in the document.
- confidence 0.0-1.0. Use high confidence only when clearly supported.
- requires_action true when the user likely needs to do something (pay, renew, submit, follow up).
- Prefer school_closure for "schools closed" / "no school" / holiday closures.
- Prefer expiration for registration/license/warranty end dates.
- Prefer follow_up for "follow up within N days" style commitments.
- Return {"items":[]} if nothing actionable/future-valued is present.
- Max 40 items. Prefer fewer high-quality items.`;
}

export async function extractGuardianItemsWithLlm(
  input: GuardianItemLlmInput
): Promise<GuardianExtractionResult | null> {
  const text = input.sourceText.trim().slice(0, 14_000);
  if (!text) return null;

  const client = createLlmClient();
  const contextParts = [
    input.spaceName ? `Space: ${input.spaceName}` : null,
    input.title ? `Title: ${input.title}` : null,
    input.documentType ? `Document type: ${input.documentType}` : null,
    input.summary ? `Summary: ${input.summary}` : null,
    input.importantDates?.length
      ? `Analysis important dates: ${JSON.stringify(input.importantDates).slice(0, 1500)}`
      : null,
    "",
    "Document text:",
    text,
  ]
    .filter((p) => p !== null)
    .join("\n");

  const response = await client.messages.create({
    model: CHAT_MODEL,
    max_tokens: 4096,
    system: buildSystemPrompt(),
    messages: [
      {
        role: "user",
        content: `Extract Guardian items from this document (${input.fileName}):\n\n${contextParts}`,
      },
    ],
    output_config: {
      format: jsonSchemaOutputFormat(GUARDIAN_EXTRACTION_JSON_SCHEMA),
    },
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(block.text);
  } catch {
    return null;
  }

  return parseGuardianExtraction(parsed);
}
