/**
 * Derive guardian_events from free-form "Tell Guardian" text (no LLM).
 * Space is optional — leave null when classification is uncertain.
 * Same text is idempotent (stable content dedupe keys — no timestamps).
 */

import { tellGuardianDedupeKey } from "./dedupe";
import type { CreateGuardianEventInput, GuardianEventType } from "./types";

export type TellGuardianDeriveArgs = {
  userId: string;
  text: string;
  /** Optional Space when user or classifier is confident. */
  spaceId?: string | null;
  confidenceScore?: number | null;
  now?: Date;
};

function firstLineTitle(text: string): string {
  const line = text.trim().split(/\r?\n/)[0]?.trim() ?? "Note";
  return line.slice(0, 300) || "Note";
}

function looksLikeMeeting(text: string): boolean {
  return /\b(met|meeting|spoke with|talked to|call with|caught up with)\b/i.test(
    text
  );
}

function looksLikeFollowUp(text: string): boolean {
  return /\b(promised|promise|follow[- ]?up|send|remind|next week|tomorrow|due)\b/i.test(
    text
  );
}

function looksLikeDecision(text: string): boolean {
  return /\b(decided|decision|agreed to|we're going with|will go with)\b/i.test(
    text
  );
}

function pickPrimaryType(text: string): GuardianEventType {
  if (looksLikeDecision(text)) return "decision";
  if (looksLikeMeeting(text)) return "meeting";
  return "note";
}

/**
 * Build create payloads from Tell Guardian text.
 * At most one primary card + optional distinct follow-up (never note+meeting twins).
 */
export function deriveEventsFromTellGuardian(
  args: TellGuardianDeriveArgs
): CreateGuardianEventInput[] {
  const text = args.text.trim();
  if (!text) return [];

  const now = args.now ?? new Date();
  const occurredAt = now.toISOString();
  const title = firstLineTitle(text);
  const spaceId = args.spaceId ?? null;
  const confidence =
    spaceId == null ? null : (args.confidenceScore ?? 0.7);

  const primaryType = pickPrimaryType(text);
  const primary: CreateGuardianEventInput = {
    userId: args.userId,
    spaceId,
    eventType: primaryType,
    title,
    summary: text.slice(0, 8000),
    occurredAt,
    sourceType: "tell_guardian",
    sourceId: null,
    dedupeKey: tellGuardianDedupeKey({ eventType: primaryType, text }),
    importanceScore: 0.55,
    actionRequired: false,
    status: "open",
    metadata: { source_label: "Manual note" },
    createdBy: "user",
    confidenceScore: confidence,
  };

  const out: CreateGuardianEventInput[] = [primary];

  if (looksLikeFollowUp(text)) {
    const followTitleRaw =
      /\bsend\b.{0,40}\b(demo|proposal|info|document|email)\b/i.exec(text)?.[0] ??
      "Follow up";
    const followTitle = followTitleRaw
      .replace(/^./, (c) => c.toUpperCase())
      .slice(0, 300);
    out.push({
      userId: args.userId,
      spaceId,
      eventType: "follow_up",
      title: followTitle,
      summary: text.slice(0, 8000),
      occurredAt,
      sourceType: "tell_guardian",
      sourceId: null,
      dedupeKey: tellGuardianDedupeKey({
        eventType: "follow_up",
        text,
      }),
      importanceScore: 0.75,
      actionRequired: true,
      status: "open",
      metadata: {
        source_label: "Manual note",
        derived_from_tell_guardian: true,
      },
      createdBy: "user",
      confidenceScore: confidence,
    });
  }

  return out;
}

/** Suggest a space id when the note mentions a profile display name. */
export function suggestSpaceIdFromText(
  text: string,
  spaces: Array<{ id: string; display_name: string }>
): { spaceId: string; confidence: number } | null {
  const lower = text.toLowerCase();
  const hits: Array<{ id: string; name: string }> = [];
  for (const s of spaces) {
    const name = s.display_name.trim();
    if (name.length < 3) continue;
    if (lower.includes(name.toLowerCase())) {
      hits.push({ id: s.id, name });
    }
  }
  if (hits.length === 1) {
    return { spaceId: hits[0]!.id, confidence: 0.85 };
  }
  return null;
}
