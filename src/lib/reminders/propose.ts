import { formatReminderWhen, zonedDateTimeToIso } from "./time";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";

export type ProposedReminder = {
  title: string;
  date: string;
  time: string;
};

const REMINDER_INTENT =
  /\b(remind(?:\s+me)?|set\s+(?:a\s+)?reminder|add\s+(?:a\s+)?reminder|nudge\s+me|alert\s+me)\b/i;

/** True when the user is asking Gideon to set or propose a reminder. */
export function wantsReminderAgent(question: string): boolean {
  return REMINDER_INTENT.test(question.trim());
}

export const REMINDER_AGENT_SYSTEM_NOTE = `Reminder agent mode:
The user wants a reminder. Answer briefly from the vault (or their message), then if you can determine a future date grounded in RETRIEVED EXCERPTS, RETRIEVED DAILY LOGS, or an explicit date/time in the user's message, end with exactly:

## PROPOSED REMINDER
title: <short title under 200 characters>
date: YYYY-MM-DD
time: HH:mm

Use 09:00 if no time is given. Never invent a date that is not in the vault or the user's message. If you cannot propose a grounded future reminder, omit the PROPOSED REMINDER section and say what is missing. Do not create the reminder yourself — the user will confirm in the app.`;

const SECTION_START = /^#{1,3}\s*PROPOSED REMINDER\s*$/i;

/**
 * Pull a structured reminder proposal from Gideon markdown, if present and valid.
 */
export function parseProposedReminder(
  content: string,
  nowMs: number = Date.now()
): ProposedReminder | null {
  const lines = content.split(/\r?\n/);
  let i = lines.findIndex((line) => SECTION_START.test(line.trim()));
  if (i < 0) return null;

  const fields: Record<string, string> = {};
  for (let j = i + 1; j < lines.length; j++) {
    const line = lines[j]!.trim();
    if (!line) continue;
    if (/^#{1,3}\s+/.test(line)) break;
    const m = /^(title|date|time)\s*:\s*(.+)$/i.exec(line);
    if (m) {
      fields[m[1]!.toLowerCase()] = m[2]!.trim();
    }
  }

  const title = (fields.title ?? "").trim().slice(0, 200);
  const date = (fields.date ?? "").trim();
  const time = (fields.time ?? "09:00").trim();
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;

  const dueAt = zonedDateTimeToIso({
    date,
    time,
    timeZone: GUARDIAN_TIME_ZONE,
  });
  if (!dueAt) return null;
  const dueMs = new Date(dueAt).getTime();
  if (Number.isNaN(dueMs) || dueMs < nowMs - 60_000) return null;

  return { title, date, time };
}

/** Remove the PROPOSED REMINDER section so it is not shown as normal chat text. */
export function stripProposedReminderSection(content: string): string {
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

export function proposedReminderWhenLabel(
  proposal: ProposedReminder
): string {
  const dueAt = zonedDateTimeToIso({
    date: proposal.date,
    time: proposal.time,
    timeZone: GUARDIAN_TIME_ZONE,
  });
  return formatReminderWhen(dueAt, proposal.date);
}
