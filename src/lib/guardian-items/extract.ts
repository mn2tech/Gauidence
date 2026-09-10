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
  newsletterMode?: boolean;
  publicationDate?: string | null;
  homeworkWeekStart?: string | null;
};

function buildSystemPrompt(newsletterMode?: boolean): string {
  if (newsletterMode) {
    return `You are Guardian's School Newsletter Item Extraction engine.
Extract structured school items from classroom newsletters.

Item types to prefer:
- school_event, homework, test, study_reminder, spelling_list
- announcement, school_contact, early_dismissal, no_school, no_homework
- school_closure (legacy alias for no_school holidays)

CRITICAL RULES:
- "No homework" / "Wednesday — No homework" MUST become type "no_homework" with the resolved calendar date. Never skip it.
- Resolve weekday-only lines (Monday…Friday) using the homework week start / publication date context provided.
- Use ISO dates YYYY-MM-DD. Include start_at/end_at as ISO datetimes when times are present (e.g. 7:00–9:00 PM).
- One spelling_list item for the full word list (do not emit one item per word).
- Never invent a child name. Set child_reference only when the newsletter explicitly names the student.
- Every item MUST include a short verbatim source_excerpt.
- confidence 0.0-1.0. Max 40 items. Prefer fewer high-quality items.
- Return {"items":[]} if nothing school-relevant is present.`;
  }

  return `You are Guardian's Item Extraction engine.
Extract ONLY information with meaningful future or actionable value for the user.

Extract items such as:
- school closures, appointments, deadlines, payments, renewals, expirations
- forms / document requirements, follow-ups, business commitments
- events, travel, meetings, return windows, warranty dates, important reminders
- For school newsletters: homework, no_homework, tests, study_reminder, school_event, early_dismissal, no_school, spelling_list

Do NOT create items for low-value historical or evergreen facts such as:
- company founded in YYYY
- document generated / printed dates with no user action
- typical school week schedules ("Monday through Friday") without specific homework
- marketing CTAs ("contact us today")
- bare email addresses, phone numbers, or contact lines as standalone items
- long program/service descriptions that are not themselves a user action
- date-inference commentary ("screenshot timestamp suggests…", "inferred Monday…")

Rules:
- One item per real-world user action or dated event. Do NOT split one request into multiple near-duplicate cards.
- Fold supporting details (who, email, program blurb, start day) into title/description of the single action — do not emit them as separate items.
- Every item MUST include a short verbatim source_excerpt from the text.
- Never invent exact dates. If the text says "next Friday" without enough context for an unambiguous calendar date, omit event_date/due_at (set null) rather than guessing.
- Use ISO dates YYYY-MM-DD when dates are explicit in the document.
- "No homework" is an explicit item (type no_homework) — never treat it as an empty extraction.
- confidence 0.0-1.0. Use high confidence only when clearly supported.
- requires_action true when the user likely needs to do something (pay, renew, submit, follow up).
- Prefer school_closure or no_school for "schools closed" / "no school" / holiday closures.
- Prefer expiration for registration/license/warranty end dates.
- Prefer follow_up for "follow up within N days" style commitments.
- Conferences, summits, forums, and similar dated events → type "event" with event_date; set requires_action true when registration, RSVP, or attendance is implied.
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
    input.publicationDate
      ? `Newsletter publication date: ${input.publicationDate}`
      : null,
    input.homeworkWeekStart
      ? `Homework week starts (Monday): ${input.homeworkWeekStart}`
      : null,
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
    system: buildSystemPrompt(input.newsletterMode),
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
