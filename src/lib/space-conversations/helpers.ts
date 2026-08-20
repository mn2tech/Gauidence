/**
 * Pure helpers for Space Conversations (safe for unit tests).
 */

/** True when the message invokes Gideon (e.g. "@Gideon summarize…"). */
export function mentionsGideon(content: string): boolean {
  return /@gideon\b/i.test(content);
}

/**
 * Strip @Gideon mention(s) to form the retrieval question.
 * Falls back to full content if stripping leaves nothing useful.
 */
export function extractGideonQuestion(content: string): string {
  const stripped = content
    .replace(/@gideon\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || content.trim();
}

/** Empty-state suggestion chips for a Space with no messages yet. */
export function emptyConversationSuggestions(spaceDisplayName: string): {
  id: string;
  label: string;
  /** Prefill for the composer; null = invite action */
  prompt: string | null;
  action: "ask" | "invite";
}[] {
  const name = spaceDisplayName.trim() || "this Space";
  return [
    {
      id: "ask-space",
      label: "Ask Gideon about this Space",
      prompt: `@Gideon What should I know about ${name}?`,
      action: "ask",
    },
    {
      id: "summarize-files",
      label: "Summarize recent files",
      prompt: "@Gideon Summarize the recent files in this Space.",
      action: "ask",
    },
    {
      id: "needs-attention",
      label: "What needs attention?",
      prompt: "@Gideon What needs attention in this Space?",
      action: "ask",
    },
    {
      id: "invite",
      label: "Invite someone",
      prompt: null,
      action: "invite",
    },
  ];
}

/** Derive a short title from message content for Save-as items. */
export function deriveKnowledgeTitle(content: string, maxLen = 72): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  if (!oneLine) return "Untitled";
  if (oneLine.length <= maxLen) return oneLine;
  const cut = oneLine.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}
