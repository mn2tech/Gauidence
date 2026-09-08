import { isValidLogDate, todayLogDate, formatLogDayHeading } from "./types";
import { wantsReminderAgent } from "@/lib/reminders/propose";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";
import type { ChatTurn } from "@/lib/vault/expandRetrievalQuestion";

export type ProposedDailyLog = {
  title?: string;
  content: string;
  logDate: string;
};

const DAILY_LOG_CAPTURE_INTENT =
  /\b(remember\s+(?:that|this|for\s+me)\b|log\s+this|add\s+(?:this|that|these|them|it)\s+to\s+(?:the\s+)?(?:\w+(?:'s)?\s+)?(?:vault|space)|save\s+(?:this|that|these|them|it|the\s+list)\b(?:\s+to\s+(?:the\s+)?(?:\w+(?:'s)?\s+)?(?:vault|space))?|add\s+to\s+(?:the\s+)?(?:\w+(?:'s)?\s+)?(?:vault|space)\b|note\s+that|write\s+(?:this|that|these|them)\s+down|jot\s+(?:this|that|these|them)\s+down|keep\s+(?:this|that|these|them)\s+in\s+mind|don'?t\s+forget\s+that|capture\s+this|store\s+(?:this|that|these|them|it)\b|make\s+(?:this|that|these|them|it)\s+permanent|make\s+(?:them|these)\s+permanent|put\s+(?:this|that|these|them|it)\s+in\s+(?:the\s+)?(?:vault|space)|(?:create|make|write|start|add)\s+(?:me\s+)?(?:a\s+)?(?:daily\s+)?log(?:\s+entry)?|new\s+(?:daily\s+)?log\s+entry|make\s+a\s+note(?:\s+that)?|save\s+(?:as|to)\s+(?:a\s+)?(?:daily\s+)?log)\b/i;

const SAVE_CHAT_CONTENT_FOLLOWUP =
  /\b(save|store|keep|add)\s+(?:this|that|it|these|them|the\s+list|what\s+you\s+(?:just\s+)?(?:said|listed|wrote))\b/i;

const DAILY_LOG_QUERY =
  /\b(what|when|where|who|which|how|did|do|does|have|has|had|show|list|find|search|tell\s+me\s+about|recall|look\s+up)\b.{0,48}\b(log|logs|note|notes|daily\s+log|vault)\b/i;

const DAILY_LOG_CONFIRM_ACK =
  /^(yes|yeah|yep|yup|ok(?:ay)?|sure|go ahead|do it|confirm(?:ed)?|please do|that'?s? (?:right|correct|good)|sounds good|perfect|add it|save it|save that|log it|put it in(?: the vault)?)\.?$/i;

const DAILY_LOG_SHORT_VAULT_CONFIRM =
  /^(?:please\s+)?(?:add|save|log|put)\s+(?:it|that|this)(?:\s+to\s+(?:the\s+)?(?:\w+(?:'s)?\s+)?vault)?\.?$/i;

const WRONG_DAILY_LOG_UI =
  /\b(\+?\s*Add Daily Log|Daily Log\s*[→\-–]\s*New Entry|open Daily Logs?|paste (?:or type|it) into|cannot actually create|don'?t have (?:the )?(?:permission|ability) to (?:write|create|save)|only \*?propose\*?.{0,80}cannot|no (?:technical )?permission to write)\b/i;

/** Short affirmations after Gideon already proposed a Daily Log (user should use Save to vault). */
export function isDailyLogConfirmationMessage(question: string): boolean {
  const q = question.trim();
  if (!q || q.length > 120) return false;
  if (DAILY_LOG_CONFIRM_ACK.test(q)) return true;
  if (DAILY_LOG_SHORT_VAULT_CONFIRM.test(q)) return true;
  return (
    /\b(yes|yeah|yep|ok(?:ay)?|sure|go ahead|please|confirm(?:ed)?)\b/i.test(q) &&
    /\b(save|add|log|vault|space|it|that|this)\b/i.test(q)
  );
}

function lastAssistantProposedDailyLog(history: ChatTurn[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn?.role === "assistant") {
      return parseProposedDailyLog(turn.content) !== null;
    }
  }
  return false;
}

function lastAssistantSavableContent(history: ChatTurn[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn?.role !== "assistant") continue;
    if (parseProposedDailyLog(turn.content)) return null;
    const body = stripProposedDailyLogSection(turn.content).trim();
    if (body.length < 40) return null;
    // Schedule / list-like content the user may want saved after "confirmed".
    if (
      /\b\d{1,2}:\d{2}\b/.test(body) ||
      /^[-*•]\s+/m.test(body) ||
      /^\d+\.\s+/m.test(body) ||
      /\b(schedule|today|morning|afternoon|evening)\b/i.test(body)
    ) {
      return body.slice(0, 8000);
    }
    return null;
  }
  return null;
}

/** True when the user wants Gideon to propose saving a Daily Log from chat. */
export function wantsDailyLogCapture(
  question: string,
  chatHistory: ChatTurn[] = []
): boolean {
  const q = question.trim();
  if (!q) return false;
  if (
    lastAssistantProposedDailyLog(chatHistory) &&
    isDailyLogConfirmationMessage(q)
  ) {
    return false;
  }
  if (wantsReminderAgent(q)) return false;
  if (DAILY_LOG_QUERY.test(q)) return false;
  if (/\b(upload|attach|add\s+(?:a\s+)?(?:file|document|photo|image))\b/i.test(q)) {
    return false;
  }
  if (DAILY_LOG_CAPTURE_INTENT.test(q)) return true;
  if (SAVE_CHAT_CONTENT_FOLLOWUP.test(q)) return true;
  // "confirmed" / "yes" after an unsaved schedule in chat → propose a log
  if (
    isDailyLogConfirmationMessage(q) &&
    lastAssistantSavableContent(chatHistory)
  ) {
    return true;
  }
  return false;
}

export const DAILY_LOG_CAPTURE_SYSTEM_NOTE = `Daily log capture mode:
The user wants to save a note to their space (Daily Log). Acknowledge briefly, then propose what to save.

If they refer to "this", "that", "the list", "today's schedule", "confirmed", or something from the current chat, use the relevant content from the conversation (including your previous reply) as the note body — do not ask them to paste it again.

You MUST end with exactly this block (required — without it, nothing is saved):

## PROPOSED DAILY LOG
title: <short title under 200 characters — optional but preferred>
content: <the note to save — plain text; may continue on following lines>
log_date: YYYY-MM-DD

Use today's date if no date is given. Never invent facts not in the user's message or this conversation. If you cannot determine what to save, omit the PROPOSED DAILY LOG section and ask what to remember.

Confirmation happens in this chat: after your reply, the app shows Save to space / Edit first under your message. Tell the user to tap Save to space there. Do not claim you lack permission to create Daily Logs. Do not send them to another screen or form to create the log.

If RETRIEVED DAILY LOGS already contains this note, or you already proposed a Daily Log in this thread and the user affirmed or saved it, acknowledge it is saved in their space — do NOT emit another PROPOSED DAILY LOG. The app has Save to space / Edit first buttons; the user does not need a second proposal.`;

const SECTION_START = /^#{1,3}\s*PROPOSED DAILY LOG\s*$/i;

function trimField(value: string | undefined, max = 8000): string | undefined {
  if (!value) return undefined;
  const t = value.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

/** Pull a structured Daily Log proposal from Gideon markdown. */
export function parseProposedDailyLog(
  content: string,
  defaultLogDate: string = todayLogDate()
): ProposedDailyLog | null {
  const lines = content.split(/\r?\n/);
  const i = lines.findIndex((line) => SECTION_START.test(line.trim()));
  if (i < 0) return null;

  const fields: Record<string, string> = {};
  const contentLines: string[] = [];
  let collectingContent = false;

  for (let j = i + 1; j < lines.length; j++) {
    const line = lines[j]!;
    const trimmed = line.trim();
    if (/^#{1,3}\s+/.test(trimmed)) break;

    if (collectingContent) {
      const fieldMatch = /^(title|log_date|logdate)\s*:\s*(.*)$/i.exec(trimmed);
      if (fieldMatch) {
        collectingContent = false;
        const key = fieldMatch[1]!.toLowerCase().replace(/_/g, "");
        const val = fieldMatch[2]!.trim();
        if (key === "logdate") {
          fields.logdate = val;
        } else {
          fields[key] = val;
        }
        continue;
      }
      contentLines.push(line);
      continue;
    }

    if (!trimmed) continue;

    const m = /^(title|content|log_date|logdate)\s*:\s*(.*)$/i.exec(trimmed);
    if (m) {
      const key = m[1]!.toLowerCase().replace(/_/g, "");
      const val = m[2]!.trim();
      if (key === "content") {
        collectingContent = true;
        if (val) contentLines.push(val);
      } else {
        fields[key] = val;
      }
      continue;
    }
  }

  const body = trimField(contentLines.join("\n").trim());
  if (!body) return null;

  const title = trimField(fields.title, 200);
  const logDateRaw = (fields.logdate ?? "").trim();
  const logDate = isValidLogDate(logDateRaw) ? logDateRaw : defaultLogDate;

  return {
    title,
    content: body,
    logDate,
  };
}

/** Remove the proposal section from displayed chat text. */
export function stripProposedDailyLogSection(content: string): string {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (SECTION_START.test(line.trim())) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (/^#{1,3}\s+\S/.test(line.trim())) {
        skipping = false;
        out.push(line);
      }
      continue;
    }
    out.push(line);
  }
  return out.join("\n").trim();
}

function scrubWrongDailyLogUiCopy(text: string): string {
  return text
    .replace(
      /I can only \*?propose\*?.{0,220}?(?:myself|database|app)\.?/gi,
      ""
    )
    .replace(
      /(?:please\s+)?(?:click|tap|use|open).{0,60}?(?:\+?\s*)?Add Daily Log.{0,120}?\./gi,
      ""
    )
    .replace(
      /(?:please\s+)?(?:go to|open).{0,40}?Daily Log.{0,80}?(?:New Entry|form).{0,40}?\./gi,
      ""
    )
    .replace(
      /Paste or type.{0,80}?(?:schedule|note|log).{0,40}?\./gi,
      ""
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Repair model refusals that send users to the wrong Daily Log UI.
 * Ensures a ## PROPOSED DAILY LOG block exists when capture was requested.
 */
export function repairDailyLogCaptureAnswer(
  answer: string,
  args: {
    history?: ChatTurn[];
    userQuestion?: string;
    defaultLogDate?: string;
  } = {}
): string {
  const history = args.history ?? [];
  const logDate = args.defaultLogDate ?? todayLogDate();
  const existing = parseProposedDailyLog(answer, logDate);
  if (existing) {
    const visible = scrubWrongDailyLogUiCopy(
      stripProposedDailyLogSection(answer)
    );
    const intro =
      visible ||
      "Ready to save this as a Daily Log — tap **Save to space** under this message.";
    return [
      intro,
      "",
      "## PROPOSED DAILY LOG",
      existing.title ? `title: ${existing.title}` : "title: Daily Log",
      "content:",
      existing.content,
      `log_date: ${existing.logDate}`,
    ].join("\n");
  }

  if (!WRONG_DAILY_LOG_UI.test(answer) && !/cannot create Daily Logs?/i.test(answer)) {
    return answer;
  }

  const fromHistory = lastAssistantSavableContent(history);
  const cleaned = scrubWrongDailyLogUiCopy(answer);
  const body =
    fromHistory ||
    (cleaned.length >= 40 ? cleaned : null) ||
    args.userQuestion?.trim() ||
    null;

  if (!body || body.length < 8) {
    return [
      "I can save this from chat. Once I have the note content, tap **Save to space** under the proposal — no need to create it on another screen.",
      "",
      "What should I put in today's Daily Log?",
    ].join("\n");
  }

  return [
    "Here's a Daily Log proposal from our chat. Tap **Save to space** under this message to create it.",
    "",
    "## PROPOSED DAILY LOG",
    "title: Daily Log",
    "content:",
    body.slice(0, 8000),
    `log_date: ${logDate}`,
  ].join("\n");
}

export function proposedDailyLogSummary(
  proposal: ProposedDailyLog,
  timeZone: string = GUARDIAN_TIME_ZONE
): string {
  const today = todayLogDate(timeZone);
  const dateLabel =
    proposal.logDate === today
      ? "today"
      : formatLogDayHeading(proposal.logDate, today).toLowerCase();
  const head = proposal.title?.trim()
    ? `"${proposal.title.trim()}"`
    : "Daily Log";
  const preview =
    proposal.content.length > 120
      ? `${proposal.content.slice(0, 117)}…`
      : proposal.content;
  return `${head} · ${dateLabel}: ${preview}`;
}
