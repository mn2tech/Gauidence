/**
 * Compact rolling conversation summary — preserves goals, entities, decisions.
 */

import type { ActiveEntity, ChatTurn, PendingAction } from "./types.ts";

const MAX_SUMMARY_CHARS = 900;

export function summarizeConversation(args: {
  previousSummary: string | null;
  recentMessages: ChatTurn[];
  activeGoal: string | null;
  activeEntities: ActiveEntity[];
  pendingActions?: PendingAction[];
  lastUserMessage: string;
  lastAssistantMessage?: string | null;
}): string {
  const {
    previousSummary,
    activeGoal,
    activeEntities,
    pendingActions = [],
    lastUserMessage,
    lastAssistantMessage,
  } = args;

  const entityLine = activeEntities
    .slice(0, 6)
    .map((e) => {
      const id = e.canonical_id ? ` [${e.canonical_id}]` : "";
      return `${e.type}:${e.name}${id}`;
    })
    .join("; ");

  const actionLine = pendingActions
    .filter((a) => a.status === "suggested" || a.status === "discussing")
    .slice(0, 4)
    .map((a) => `${a.type}:${a.status}${a.target ? `@${a.target}` : ""}`)
    .join("; ");

  const userBit = lastUserMessage.trim().slice(0, 180);
  const asstBit = (lastAssistantMessage ?? "").trim().slice(0, 180);

  const parts: string[] = [];
  if (activeGoal) parts.push(`Goal: ${activeGoal}`);
  if (entityLine) parts.push(`Entities: ${entityLine}`);
  if (actionLine) parts.push(`Pending: ${actionLine}`);
  if (previousSummary?.trim()) {
    // Keep prior summary compact — drop filler, retain last spine
    const prior = previousSummary.trim().slice(0, 400);
    if (!parts.some((p) => prior.includes(p.slice(0, 40)))) {
      parts.push(`Prior: ${prior}`);
    }
  }
  parts.push(`Latest user: ${userBit}`);
  if (asstBit) parts.push(`Latest assistant: ${asstBit}`);

  let summary = parts.join(" | ");
  if (summary.length > MAX_SUMMARY_CHARS) {
    summary = summary.slice(0, MAX_SUMMARY_CHARS - 1) + "…";
  }
  return summary;
}

/** True when summary should refresh (enough new turns or empty). */
export function shouldRefreshSummary(
  previousSummary: string | null,
  messageCount: number
): boolean {
  if (!previousSummary?.trim()) return true;
  // Refresh every few turns once history grows past the window
  return messageCount >= 4;
}
