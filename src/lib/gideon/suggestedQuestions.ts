/**
 * Contextual follow-up questions for Ask Gideon answers.
 * Pure helpers — safe for unit tests. No Space-specific hardcoding.
 *
 * Policy (knowledge-first):
 * - Max 3
 * - Do NOT show after every answer
 * - Only when a follow-up naturally continues this turn
 * - Prefer Guardian context over generic AI chips
 */

import {
  findMentionedButUnavailable,
  isDocumentAvailable,
} from "./evidenceBoundaries";

export type SuggestedQuestionContext = {
  question: string;
  answer: string;
  /** Entity / organization / person names involved in this turn. */
  entityNames?: string[];
  /** Labels of documents actually available (citations, inventory, evidence with documentId). */
  availableDocumentLabels?: string[];
  /** Evidence / excerpt snippets from this turn. */
  evidenceTexts?: string[];
  /** Explicit knowledge-gap lines already known. */
  gaps?: string[];
  /** When true and real gaps exist, prefer evidence / gap follow-ups. */
  preferEvidenceOrGap?: boolean;
};

/** Max contextual follow-ups after a Guardian knowledge answer. */
const MAX_SUGGESTIONS = 3;
const MAX_WORDS = 10;

const GENERIC_FILLER =
  /^(what else is known in this space|tell me more about the key details|what can'?t guardian answer yet|what document should i add next)\??$/i;

function countWords(q: string): number {
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
  if (!q || countWords(q) > MAX_WORDS) return;
  if (GENERIC_FILLER.test(q)) return;
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
  const parts = name
    .replace(/,?\s*(Inc|LLC|Ltd|Corp)\.?$/i, "")
    .trim()
    .split(/\s+/);
  if (parts.length <= 2) return parts.join(" ");
  return parts.slice(0, 2).join(" ");
}

/** Pull person names from structured answer lines like "Name: Jeff Hunt". */
export function extractPeopleFromAnswer(answer: string): string[] {
  const names: string[] = [];
  const patterns = [
    /(?:\*\*)?Name(?:\*\*)?:\s*([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+)+)/g,
    /(?:^|\n)\s*[-*•]\s*\*?\*?([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+)+)\*?\*?\s*(?:\n|$)/g,
  ];
  for (const re of patterns) {
    for (const m of answer.matchAll(re)) {
      const n = m[1]?.trim();
      if (n && n.split(/\s+/).length >= 2 && n.split(/\s+/).length <= 4) {
        names.push(n);
      }
    }
  }
  return [...new Set(names)];
}

function looksLikePersonAnswer(answer: string): boolean {
  return (
    (/\b(email|phone|title|company|rsvp)\b\s*:/i.test(answer) &&
      extractPeopleFromAnswer(answer).length > 0) ||
    /\bRSVP'?d\b/i.test(answer)
  );
}

function looksLikeRosterContext(question: string, answer: string): boolean {
  const blob = `${question}\n${answer}`;
  return (
    /\b(roster|guest list|attendees?|participants?|registration list)\b/i.test(
      blob
    ) ||
    /\bRSVP\b/i.test(blob) ||
    looksLikePersonAnswer(answer)
  );
}

function looksLikeOrgEntity(name: string, answer: string): boolean {
  if (
    looksLikePersonAnswer(answer) &&
    extractPeopleFromAnswer(answer).some((p) =>
      p.toLowerCase().includes(name.toLowerCase().split(/\s+/)[0] ?? "")
    )
  ) {
    return false;
  }
  return /\b(Inc|LLC|Ltd|Corp|Capital|Management|Associates|Partners|Church|Ministry)\b/i.test(
    name
  );
}

function isBusinessDisclosureTurn(question: string, answer: string): boolean {
  const blob = `${question}\n${answer}`;
  return /\b(form crs|form adv|fee|fees|compensation|conflict of interest|advisory|ria|minimum investment|item 5)\b/i.test(
    blob
  );
}

function isEntityOverviewQuestion(question: string): boolean {
  return /\b(what do (we|you|i) know about|tell me about|everything .{0,20}know|who is|what is)\b/i.test(
    question
  );
}

function isUnknownOrRefusal(answer: string): boolean {
  return /\b(I don't have|could not find|not in (this |its )?Space yet|don't currently have)\b/i.test(
    answer
  );
}

/**
 * True only when follow-up chips are likely useful for this turn.
 * Keeps the bottom of the chat free of noise.
 */
export function shouldAttachSuggestedQuestions(ctx: {
  question: string;
  answer: string;
}): boolean {
  const question = ctx.question.trim();
  const answer = ctx.answer.trim();
  if (!question || !answer) return false;
  if (countWords(answer) < 6) return false;
  if (isUnknownOrRefusal(answer)) return false;
  if (/^(hi|hey|hello|thanks|thank you)\b/i.test(question)) return false;
  // Pure general definitions rarely need Guardian follow-ups.
  if (/^what is (a|an)\b/i.test(question) && !/\b(my|our|space|document)\b/i.test(question)) {
    return false;
  }
  return (
    looksLikeRosterContext(question, answer) ||
    isBusinessDisclosureTurn(question, answer) ||
    isEntityOverviewQuestion(question) ||
    /\b(missing|not (currently )?available|Form ADV|gap)\b/i.test(answer)
  );
}

/**
 * Build up to 3 contextual follow-up questions from the current turn.
 * Returns [] when nothing relevant — callers should not force chips.
 */
export function buildSuggestedQuestions(
  ctx: SuggestedQuestionContext
): string[] {
  const question = ctx.question.trim();
  const answer = ctx.answer.trim();
  if (!shouldAttachSuggestedQuestions({ question, answer })) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const people = extractPeopleFromAnswer(answer);
  const entity = primaryEntity([
    ...people,
    ...(ctx.entityNames ?? []),
  ]);
  const shortName = entity ? shortEntityLabel(entity) : null;
  const personFocus = people[0] ? shortEntityLabel(people[0]) : null;
  const available = ctx.availableDocumentLabels ?? [];
  const evidenceTexts = [...(ctx.evidenceTexts ?? []), answer];
  const unavailable = findMentionedButUnavailable({
    evidenceTexts,
    availableDocumentLabels: available,
  });
  const hasExplicitGaps =
    (ctx.gaps?.length ?? 0) > 0 || unavailable.length > 0;
  const hasAnswerGaps =
    /\b(missing|not (currently )?available|could not (find|determine))\b/i.test(
      answer
    );
  const hasGaps = hasExplicitGaps || hasAnswerGaps;
  const rosterContext = looksLikeRosterContext(question, answer);
  const businessTurn = isBusinessDisclosureTurn(question, answer);
  const overview = isEntityOverviewQuestion(question);

  // --- Roster / RSVP / contact cards ---
  if (rosterContext) {
    if (personFocus) {
      pushUnique(
        out,
        seen,
        `What else do we know about ${personFocus}?`,
        question
      );
      pushUnique(out, seen, "Who else is on the roster?", question);
      if (/\brsvp\b/i.test(`${question}\n${answer}`)) {
        pushUnique(out, seen, "Who else has RSVP'd?", question);
      }
      if (/\bguest/i.test(answer)) {
        pushUnique(out, seen, `Did ${personFocus} bring guests?`, question);
      }
    } else {
      pushUnique(out, seen, "Who is on the complete roster?", question);
      pushUnique(out, seen, "Who has RSVP'd so far?", question);
    }
    pushUnique(out, seen, "Summarize the guest list", question);
    return out.slice(0, MAX_SUGGESTIONS);
  }

  // --- Business / disclosure follow-ups (only on business turns) ---
  if (businessTurn) {
    if (
      /\bfee|compensation|how .{0,12}make money|asset-based\b/i.test(answer) &&
      !/\bfee|compensation|make money\b/i.test(question)
    ) {
      pushUnique(out, seen, "How are fees described?", question);
    }
    if (/\bconflict/i.test(answer) && !/\bconflict/i.test(question)) {
      pushUnique(out, seen, "What conflicts are disclosed?", question);
    }
    if (
      (overview || /\bservices?\b/i.test(question) || /\bservices?\b/i.test(answer)) &&
      shortName &&
      looksLikeOrgEntity(shortName, answer)
    ) {
      if (!/\bservices?\b/i.test(question)) {
        pushUnique(
          out,
          seen,
          `What services does ${shortName} offer?`,
          question
        );
      }
    }
    if (
      overview &&
      shortName &&
      looksLikeOrgEntity(shortName, answer) &&
      !/\bmake money|fee|compensat/i.test(question)
    ) {
      pushUnique(out, seen, `How does ${shortName} make money?`, question);
    }
    if (
      overview &&
      shortName &&
      looksLikeOrgEntity(shortName, answer)
    ) {
      pushUnique(out, seen, `What else do we know about ${shortName}?`, question);
    }
  }

  // --- Real knowledge gaps / missing docs only ---
  if (hasGaps) {
    pushUnique(out, seen, "What information is missing?", question);
    if (unavailable[0] && !isDocumentAvailable(unavailable[0], available)) {
      const ref = unavailable[0].replace(/\s+/g, " ").trim();
      if (countWords(`What would ${ref} tell us?`) <= MAX_WORDS) {
        pushUnique(out, seen, `What would ${ref} tell us?`, question);
      }
    }
  } else if (
    ctx.preferEvidenceOrGap &&
    available.length > 0 &&
    out.length < 2 &&
    businessTurn
  ) {
    pushUnique(out, seen, "Which source supports this?", question);
  }

  // Prefer returning fewer relevant chips over generic fillers.
  return out.slice(0, MAX_SUGGESTIONS);
}

/** Parse suggested_questions jsonb from a DB / API payload. */
export function parseSuggestedQuestions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === "string")
      .map((s) => normalizeQuestion(s))
      .filter((s) => s.length > 0 && countWords(s) <= 16)
      .filter((s) => !GENERIC_FILLER.test(s))
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
