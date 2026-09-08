/**
 * Detect short replies that answer the assistant's previous question
 * (e.g. "20%", "yes", "no") so they are not treated as Space searches.
 */

import type { ChatTurn } from "./types";

const SHORT_AFFIRM =
  /^(yes|yeah|yep|yup|no|nope|nah|ok|okay|sure|thanks|thank you|please|go ahead|do it)([.!]| please| thanks)?$/i;

const SHORT_METRIC =
  /^(about |around |roughly |approx(?:imately)? )?\$?\d+(\.\d+)?\s*(%|percent|minutes?|mins?|hours?|hrs?|days?|miles?|km|mph)?\.?$/i;

const LOOKUP_VERBS =
  /\b(find|search|look up|who is|what does|tell me about|summarize|summarise|BPM|solicitation)\b/i;

export function isShortConversationalReply(message: string): boolean {
  const q = message.trim();
  if (!q || q.length > 48) return false;
  if (LOOKUP_VERBS.test(q)) return false;
  if (SHORT_AFFIRM.test(q)) return true;
  if (SHORT_METRIC.test(q)) return true;
  if (/^\d+(\.\d+)?%?$/.test(q)) return true;
  // Brief fragment without a question mark
  if (
    q.length <= 28 &&
    !q.includes("?") &&
    q.split(/\s+/).filter(Boolean).length <= 5
  ) {
    return true;
  }
  return false;
}

export function assistantInvitedReply(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  return (
    /\?/.test(t) ||
    /\b(tell me|let me know|if you (tell|share|give)|what(?:'s| is) your|how (much|many|far|long)|battery|percent|%\b)\b/i.test(
      t
    )
  );
}

function compactAssistantContext(content: string, max = 360): string {
  const cleaned = content.trim().replace(/\s+/g, " ");
  if (cleaned.length <= max) return cleaned;
  // Prefer the trailing ask (usually the clarifying question).
  return cleaned.slice(-max);
}

function lastInvitingAssistant(
  recentMessages: ChatTurn[],
  fallbackAssistantContent?: string | null
): ChatTurn | null {
  const fromHistory = [...recentMessages]
    .reverse()
    .find((m) => m.role === "assistant" && m.content.trim());
  if (fromHistory && assistantInvitedReply(fromHistory.content)) {
    return fromHistory;
  }
  const fallback = fallbackAssistantContent?.trim();
  if (fallback && assistantInvitedReply(fallback)) {
    return { role: "assistant", content: fallback };
  }
  return null;
}

/**
 * Expand "20%" / "yes" into an explicit continuity prompt using the last
 * assistant turn. Returns null when not applicable.
 */
export function expandShortReplyFromHistory(
  message: string,
  recentMessages: ChatTurn[],
  fallbackAssistantContent?: string | null
): string | null {
  if (!isShortConversationalReply(message)) return null;

  const lastAssistant = lastInvitingAssistant(
    recentMessages,
    fallbackAssistantContent
  );
  if (!lastAssistant) return null;

  const answer = message.trim();
  const prior = compactAssistantContext(lastAssistant.content);
  return [
    `The user is continuing our conversation with a short reply: "${answer}".`,
    `Your previous message was: ${prior}`,
    `Interpret "${answer}" as their answer to that message and continue helpfully.`,
    `Do not search Spaces or documents for the literal text "${answer}" alone.`,
  ].join(" ");
}

/** True when a blank model reply should stay conversational, not a Space miss. */
export function shouldPreferContinuityEmptyFallback(args: {
  conversationContinuity?: boolean;
  userMessage?: string | null;
  recentMessages?: ChatTurn[];
  fallbackAssistantContent?: string | null;
}): boolean {
  if (args.conversationContinuity) return true;
  const userMessage = args.userMessage?.trim();
  if (!userMessage || !isShortConversationalReply(userMessage)) return false;
  return Boolean(
    lastInvitingAssistant(
      args.recentMessages ?? [],
      args.fallbackAssistantContent
    )
  );
}
