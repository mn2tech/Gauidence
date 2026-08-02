export type ChatTurn = { role: "user" | "assistant"; content: string };

const VAGUE_FOLLOWUP =
  /\b(full|entire|complete|verbatim|exact)\s+(log|logs|note|notes|entry|entries|request|requests|text|message)\b/i;

const DEICTIC_FOLLOWUP =
  /\b(show|give|share|display|repeat|quote)\s+(us |me )?(the |that )?(full |entire )?(log|note|it|that|this|request)\b/i;

const SHORT_DEICTIC =
  /^(and |also |)?(that|this|it|them|those)\??$/i;

/** Expand a vague follow-up with recent chat turns so retrieval stays on topic. */
export function expandRetrievalQuestion(
  question: string,
  history: ChatTurn[] = []
): string {
  const q = question.trim();
  if (!q || history.length === 0) return q;

  const needsHistory =
    VAGUE_FOLLOWUP.test(q) ||
    DEICTIC_FOLLOWUP.test(q) ||
    SHORT_DEICTIC.test(q) ||
    (q.length < 48 && /\b(it|that|this|those|them|the same)\b/i.test(q));

  if (!needsHistory) return q;

  const recent = history
    .slice(-6)
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join("\n");

  return `${q}\n\nContext from this conversation:\n${recent}`;
}

/** True when the user wants the complete Daily Log text quoted back. */
export function wantsFullDailyLogQuote(question: string): boolean {
  return (
    VAGUE_FOLLOWUP.test(question) || DEICTIC_FOLLOWUP.test(question)
  );
}
