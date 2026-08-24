/**
 * Global Guardian briefing foundation — "What do I need to know today?"
 * Interfaces only for this iteration; expand as data sources mature.
 */

export type GlobalBriefingItemKind =
  | "event"
  | "deadline"
  | "commitment"
  | "recent_upload"
  | "unresolved"
  | "daily_log"
  | "space_activity"
  | "follow_up"
  | "reminder"
  | "knowledge_change";

export type GlobalBriefingItem = {
  kind: GlobalBriefingItemKind;
  title: string;
  detail?: string;
  spaceId?: string;
  spaceName?: string;
  when?: string;
  priority?: "high" | "medium" | "low";
};

export type GlobalBriefingRequest = {
  userId: string;
  /** Local calendar date YYYY-MM-DD. */
  date: string;
  timeZone?: string;
};

export type GlobalBriefingResult = {
  date: string;
  items: GlobalBriefingItem[];
  /** True when only stubs/empty — UI should not overclaim. */
  incomplete: boolean;
  summaryHint: string;
};

export function isGlobalBriefingQuestion(question: string): boolean {
  return /\b(what do i need to (know|focus on|do) today|what needs (my )?attention( today)?|brief me( today)?|today'?s (brief|priorities|overview))\b/i.test(
    question.trim()
  );
}

/**
 * Aggregate today's signals. Returns an empty incomplete briefing until
 * live aggregators are wired to events/commitments/uploads/etc.
 */
export async function buildGlobalBriefing(
  request: GlobalBriefingRequest,
  items: GlobalBriefingItem[] = []
): Promise<GlobalBriefingResult> {
  const sorted = [...items].sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 } as const;
    return (
      (rank[a.priority ?? "medium"] ?? 1) - (rank[b.priority ?? "medium"] ?? 1)
    );
  });
  return {
    date: request.date,
    items: sorted,
    incomplete: sorted.length === 0,
    summaryHint: sorted.length
      ? `Here is what stands out for ${request.date}.`
      : `I don't have a consolidated "need to know today" feed yet. Check your schedule, commitments, and recent uploads in your Spaces.`,
  };
}

export function formatGlobalBriefingForPrompt(
  briefing: GlobalBriefingResult
): string {
  if (!briefing.items.length) {
    return `--- GLOBAL BRIEFING (${briefing.date}) ---\n${briefing.summaryHint}\n--- END GLOBAL BRIEFING ---`;
  }
  const lines = briefing.items.map((item, i) => {
    const space = item.spaceName ? ` [${item.spaceName}]` : "";
    const when = item.when ? ` @ ${item.when}` : "";
    const detail = item.detail ? ` — ${item.detail}` : "";
    return `${i + 1}. (${item.kind})${space}${when} ${item.title}${detail}`;
  });
  return `--- GLOBAL BRIEFING (${briefing.date}) ---\n${briefing.summaryHint}\n${lines.join("\n")}\n--- END GLOBAL BRIEFING ---`;
}
