/**
 * Contextual follow-up questions for Ask Gideon answers.
 * Pure helpers — safe for unit tests. No Space-specific hardcoding.
 */

import {
  findMentionedButUnavailable,
  isDocumentAvailable,
} from "./evidenceBoundaries";

export type SuggestedQuestionContext = {
  question: string;
  answer: string;
  /** Entity / organization names involved in this turn. */
  entityNames?: string[];
  /** Labels of documents actually available (citations, inventory, evidence with documentId). */
  availableDocumentLabels?: string[];
  /** Evidence / excerpt snippets from this turn. */
  evidenceTexts?: string[];
  /** Explicit knowledge-gap lines already known. */
  gaps?: string[];
  /** When true, prefer evidence / gap follow-ups. */
  preferEvidenceOrGap?: boolean;
};

const MAX_SUGGESTIONS = 4;
const MAX_WORDS = 10;

function wordCount(q: string): number {
  return q.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeQuestion(q: string): string {
  return q.trim().replace(/\s+/g, " ").replace(/[?]+$/g, "?");
}

function sameQuestion(a: string, b: string): boolean {
  return (
    a.toLowerCase().replace(/[?.,!]+$/g, "").trim() ===
    b.toLowerCase().replace(/[?.,!]+$/g, "").trim()
  );
}

function pushUnique(
  out: string[],
  seen: Set<string>,
  candidate: string,
  originalQuestion: string
): void {
  const q = normalizeQuestion(candidate);
  if (!q || wordCount(q) > MAX_WORDS) return;
  if (sameQuestion(q, originalQuestion)) return;
  const key = q.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push(q.endsWith("?") ? q : `${q}?`);
}

function primaryEntity(names: string[] | undefined): string | null {
  const name = names?.find((n) => n.trim().length >= 2)?.trim();
  return name ?? null;
}

function shortEntityLabel(name: string): string {
  // Prefer first two significant tokens for chip length.
  const parts = name.replace(/,?\s*(Inc|LLC|Ltd|Corp)\.?$/i, "").trim().split(/\s+/);
  if (parts.length <= 2) return parts.join(" ");
  return parts.slice(0, 2).join(" ");
}

/**
 * Build 3–4 contextual follow-up questions from the current turn.
 * Mixes drill-down, business context, evidence, and knowledge-gap prompts.
 */
export function buildSuggestedQuestions(
  ctx: SuggestedQuestionContext
): string[] {
  const question = ctx.question.trim();
  const answer = ctx.answer.trim();
  if (!question || !answer) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const entity = primaryEntity(ctx.entityNames);
  const shortName = entity ? shortEntityLabel(entity) : null;
  const available = ctx.availableDocumentLabels ?? [];
  const evidenceTexts = [
    ...(ctx.evidenceTexts ?? []),
    answer,
  ];
  const unavailable = findMentionedButUnavailable({
    evidenceTexts,
    availableDocumentLabels: available,
  });
  const hasGaps =
    (ctx.gaps?.length ?? 0) > 0 ||
    unavailable.length > 0 ||
    /\b(missing|not (currently )?available|could not (find|determine)|I don't have)\b/i.test(
      answer
    );
  const hasSources =
    available.length > 0 ||
    /\b(source|form crs|document|based on)\b/i.test(answer);

  // --- Drill-down from answer themes ---
  if (/\bfee|compensation|how .{0,12}make money|asset-based\b/i.test(answer)) {
    pushUnique(out, seen, "How are fees described?", question);
  }
  if (/\bconflict/i.test(answer)) {
    pushUnique(out, seen, "What conflicts are disclosed?", question);
  }
  if (/\b(service|planning|portfolio|advisory)\b/i.test(answer)) {
    pushUnique(
      out,
      seen,
      shortName ? `What services does ${shortName} offer?` : "What services are described?",
      question
    );
  }
  if (/\bdiscretionary|manage(s|d)? investments\b/i.test(answer)) {
    pushUnique(out, seen, "How is investment management described?", question);
  }

  // --- Business / entity context ---
  if (shortName) {
    pushUnique(out, seen, `What else do we know about ${shortName}?`, question);
    if (!/\bmake money|fee|compensat/i.test(question)) {
      pushUnique(out, seen, `How does ${shortName} make money?`, question);
    }
  } else {
    pushUnique(out, seen, "What else is known in this Space?", question);
  }

  // --- Evidence ---
  if (hasSources || ctx.preferEvidenceOrGap) {
    pushUnique(out, seen, "Which source supports this?", question);
  }

  // --- Knowledge gaps (prefer when useful) ---
  if (hasGaps || ctx.preferEvidenceOrGap || unavailable.length) {
    pushUnique(out, seen, "What information is missing?", question);
    if (unavailable[0] && !isDocumentAvailable(unavailable[0], available)) {
      const ref = unavailable[0].replace(/\s+/g, " ").trim();
      if (wordCount(`What would ${ref} tell us?`) <= MAX_WORDS) {
        pushUnique(out, seen, `What would ${ref} tell us?`, question);
      } else {
        pushUnique(out, seen, "What would the missing document tell us?", question);
      }
    }
    pushUnique(out, seen, "What document should I add next?", question);
  }

  // --- Generic fillers if still short ---
  pushUnique(out, seen, "Tell me more about the key details", question);
  pushUnique(out, seen, "What can't Guardian answer yet?", question);

  // Ensure at least one evidence/gap chip when useful
  if (
    (hasGaps || hasSources) &&
    !out.some((q) =>
      /source|missing|document should|can't Guardian/i.test(q)
    )
  ) {
    pushUnique(out, seen, "Which source supports this?", question);
  }

  return out.slice(0, MAX_SUGGESTIONS);
}

/** Parse suggested_questions jsonb from a DB / API payload. */
export function parseSuggestedQuestions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === "string")
      .map((s) => normalizeQuestion(s))
      .filter((s) => s.length > 0 && wordCount(s) <= 16)
      .slice(0, MAX_SUGGESTIONS);
  }
  if (typeof raw === "string") {
    try {
      return parseSuggestedQuestions(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}
