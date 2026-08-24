/**
 * Clean action interface for Gideon tool/agent plug-ins.
 * Do not mix action execution into retrieval.
 */

export type GideonActionKind =
  | "reminder"
  | "draft_email"
  | "schedule_meeting"
  | "add_to_space"
  | "save_daily_log"
  | "create_task"
  | "other";

export type GideonActionRequest = {
  kind: GideonActionKind;
  rawQuestion: string;
  userId: string;
  spaceId?: string;
  conversationId?: string;
  payload?: Record<string, unknown>;
};

export type GideonActionResult = {
  ok: boolean;
  /** Short user-facing summary. */
  summary: string;
  /** Whether the UI should ask the user to confirm before committing. */
  needsConfirmation: boolean;
  /** Opaque handle for confirm/cancel follow-up. */
  draftId?: string;
};

export type GideonActionHandler = (
  request: GideonActionRequest
) => Promise<GideonActionResult>;

const KIND_PATTERNS: Array<{ kind: GideonActionKind; re: RegExp }> = [
  { kind: "reminder", re: /\b(remind me|set a reminder|add a reminder)\b/i },
  { kind: "draft_email", re: /\bdraft (an? |the )?email\b/i },
  {
    kind: "schedule_meeting",
    re: /\b(schedule|book)\b.{0,40}\b(meeting|call|appointment)\b/i,
  },
  { kind: "save_daily_log", re: /\bsave .{0,40}\bdaily log\b/i },
  { kind: "add_to_space", re: /\badd (this|that|it) to\b/i },
  { kind: "create_task", re: /\b(create|add) (a |an )?task\b/i },
];

export function classifyActionKind(question: string): GideonActionKind {
  for (const { kind, re } of KIND_PATTERNS) {
    if (re.test(question)) return kind;
  }
  return "other";
}

/**
 * Placeholder executor — wires future tools without embedding them in RAG.
 * Existing action runners (reminders, daily logs, etc.) remain the source of truth.
 */
export async function executeGideonAction(
  request: GideonActionRequest,
  handler?: GideonActionHandler
): Promise<GideonActionResult> {
  if (handler) return handler(request);
  return {
    ok: false,
    summary: `I can help with that (${request.kind.replace(/_/g, " ")}), but need the usual confirmation flow in Ask Gideon.`,
    needsConfirmation: true,
  };
}
