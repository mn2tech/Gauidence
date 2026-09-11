import type { GuardianExtractedItem } from "./schema";

export type RecentDailyLog = {
  id: string;
  title: string | null;
  content: string;
  log_date: string;
};

export type DailyLogReconciliation = {
  completedBy: RecentDailyLog | null;
  followUp: GuardianExtractedItem | null;
};

const COMPLETION_CUE =
  /\b(?:(?:i|we)(?:'ve| have)?\s+(?:already\s+)?(?:replied|responded|sent|emailed|confirmed|gave|granted)|we(?:'re| are)\s+(?:happy|glad)\s+to\s+give\s+permission|you have our permission)\b/i;

const STOP_WORDS = new Set([
  "about", "after", "again", "already", "before", "child", "could",
  "from", "give", "have", "Monday", "please", "request", "respond",
  "response", "saying", "start", "starts", "that", "their", "there",
  "they", "this", "what", "when", "where", "which", "with", "would",
  "your",
].map((word) => word.toLowerCase()));

function topicTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
  );
}

function topicOverlap(item: GuardianExtractedItem, log: RecentDailyLog): number {
  const itemTokens = topicTokens(
    [item.title, item.description, item.source_excerpt].filter(Boolean).join(" ")
  );
  const logTokens = topicTokens(`${log.title ?? ""} ${log.content}`);
  return [...itemTokens].filter((token) => logTokens.has(token)).length;
}

function addresseeFrom(text: string): string | null {
  const match = /(?:^|\n)\s*dear\s+([^,\n]{2,80})[,\n]/i.exec(text);
  return match?.[1]?.trim() || null;
}

function requestedReplyDetail(text: string): string | null {
  const direct = /could you please\s+([^?\n]{8,260})\?/i.exec(text)?.[1];
  if (direct) return direct.trim();
  const please = /please\s+(?:share|send|confirm|let me know)\s+([^?\n]{8,260})\?/i.exec(text)?.[1];
  return please?.trim() || null;
}

/**
 * Reconcile a newly extracted request against recent user-authored evidence.
 * Requires both explicit completion language and strong topic overlap.
 */
export function reconcileItemWithDailyLogs(
  item: GuardianExtractedItem,
  logs: RecentDailyLog[]
): DailyLogReconciliation {
  const completedBy =
    logs.find(
      (log) => COMPLETION_CUE.test(log.content) && topicOverlap(item, log) >= 2
    ) ?? null;
  if (!completedBy) return { completedBy: null, followUp: null };

  const detail = requestedReplyDetail(completedBy.content);
  if (!detail) return { completedBy, followUp: null };

  const addressee = addresseeFrom(completedBy.content);
  const subject = addressee ? `${addressee}'s reply` : "a reply";
  return {
    completedBy,
    followUp: {
      type: "follow_up",
      title: `Watch for ${subject}`,
      description: `Waiting for a response about: ${detail}`,
      event_date: null,
      due_at: null,
      start_at: null,
      end_at: null,
      requires_action: true,
      priority: "normal",
      child_reference: item.child_reference ?? null,
      confidence: 0.95,
      source_excerpt: detail.slice(0, 500),
      source_page: null,
      metadata: {
        reconciliation: "awaiting_reply",
        completion_daily_log_id: completedBy.id,
      },
    },
  };
}

