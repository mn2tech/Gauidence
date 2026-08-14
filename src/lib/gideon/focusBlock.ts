/**
 * Live focus-block countdown for Ask Gideon (90/20 and similar).
 * Pure helpers — safe for unit tests.
 */

import { calendarDateInZone, zonedDateTimeToIso } from "@/lib/reminders/time";
import {
  formatGuardianTimeLabel,
  GUARDIAN_TIME_ZONE,
} from "@/lib/timezone";

export type GideonFocusBlock = {
  label: string;
  startsAt: string;
  endsAt: string;
};

export const FOCUS_BLOCK_STORAGE_KEY = "guardian.gideon.focusBlock";

const SECTION_START = /^#{1,3}\s*FOCUS BLOCK\s*$/i;
const HTML_MARKER = /<!--\s*gideon-focus:([\s\S]*?)-->/i;

const START_INTENT =
  /\b((start|begin|kick off)\b.{0,40}\b(block|90\s*\/\s*20|focus|session)|start (this|the first|the second|the third) block)\b/i;

const REMAINING_QUESTION =
  /\b((how much|what(?:'s| is) the) time (is )?left|time remaining|countdown|how (long|much) (is )?left)\b/i;

const ENDING_AT =
  /\b(?:ending at|until|through|till)\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\b/i;

const DURATION =
  /\b(\d{1,3}(?:\.\d)?)\s*(-)?\s*(minutes?|mins?|hours?|hrs?)\b/i;

const NINETY_TWENTY = /\b90\s*\/\s*20\b/;

export const FOCUS_BLOCK_SYSTEM_NOTE = `FOCUS BLOCK / LIVE COUNTDOWN:
Ask Gideon shows a live ticking clock in the chat header when a focus block is running. Never say you cannot display a live countdown, and never tell the user to set a phone timer instead of using that clock.
When the user starts a block now (or confirms starting the current/next 90/20 block), end your reply with exactly:

## FOCUS BLOCK
label: <short label under 80 characters>
date: YYYY-MM-DD
time: HH:mm

\`time\` is the end time in the user's timezone (24-hour). Use CURRENT DATE AND TIME for today.
If an ACTIVE FOCUS BLOCK is provided below, answer "how much time is left" from that block. Mention that the live clock is at the top of this chat.
Only emit FOCUS BLOCK when a block is actually starting now — not when you are merely proposing a future schedule.`;

export function isFocusRemainingQuestion(question: string): boolean {
  return REMAINING_QUESTION.test(question.trim());
}

export function wantsFocusBlockStart(question: string): boolean {
  return START_INTENT.test(question.trim());
}

export function isValidFocusBlock(
  value: unknown
): value is GideonFocusBlock {
  if (!value || typeof value !== "object") return false;
  const block = value as Record<string, unknown>;
  if (
    typeof block.label !== "string" ||
    typeof block.startsAt !== "string" ||
    typeof block.endsAt !== "string"
  ) {
    return false;
  }
  const start = Date.parse(block.startsAt);
  const end = Date.parse(block.endsAt);
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end > start &&
    block.label.trim().length > 0
  );
}

export function remainingMs(
  block: GideonFocusBlock,
  now: Date = new Date()
): number {
  return Date.parse(block.endsAt) - now.getTime();
}

/** `1:14:32` / `46:12` / `0:00` */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${minutes}:${ss}`;
}

export function formatFocusBlockPromptNote(
  block: GideonFocusBlock | null,
  now: Date = new Date(),
  timeZone: string = GUARDIAN_TIME_ZONE
): string {
  if (!block) return "";
  const left = remainingMs(block, now);
  if (left <= 0) return "";
  const endLabel = formatGuardianTimeLabel(new Date(block.endsAt), timeZone);
  return `--- ACTIVE FOCUS BLOCK ---
Label: ${block.label}
Ends: ${endLabel}
Remaining: ${formatCountdown(left)} (live clock is already showing in Ask Gideon)
Answer remaining-time questions from these numbers. Do not say you cannot show a countdown.
--- END ACTIVE FOCUS BLOCK ---`;
}

export function buildFocusRemainingAnswer(
  block: GideonFocusBlock,
  timeZone: string = GUARDIAN_TIME_ZONE,
  now: Date = new Date()
): string {
  const left = remainingMs(block, now);
  const endLabel = formatGuardianTimeLabel(new Date(block.endsAt), timeZone);
  if (left <= 0) {
    return `${block.label} has ended (it ran until ${endLabel}). Start another block whenever you're ready — the live clock will show at the top of this chat.`;
  }
  const minutes = Math.max(1, Math.round(left / 60_000));
  return `${formatCountdown(left)} left in ${block.label}, ending at ${endLabel} (${minutes} min). The live clock is ticking at the top of this chat.`;
}

export function stripFocusBlockSection(content: string): string {
  const withoutHtml = content.replace(HTML_MARKER, "").trim();
  const lines = withoutHtml.split(/\r?\n/);
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (SECTION_START.test(line.trim())) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (/^#{1,3}\s+/.test(line.trim()) && !SECTION_START.test(line.trim())) {
        skipping = false;
        out.push(line);
      }
      continue;
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseFocusBlockFromAssistant(
  content: string,
  now: Date = new Date(),
  timeZone: string = GUARDIAN_TIME_ZONE
): GideonFocusBlock | null {
  const html = parseHtmlMarker(content);
  if (html) return html;
  const section = parseFocusBlockSection(content, now, timeZone);
  if (section) return section;
  return parseEndingAt(content, now, timeZone);
}

function parseHtmlMarker(content: string): GideonFocusBlock | null {
  const match = HTML_MARKER.exec(content);
  if (!match?.[1]) return null;
  try {
    const parsed: unknown = JSON.parse(match[1].trim());
    return isValidFocusBlock(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseFocusBlockSection(
  content: string,
  now: Date,
  timeZone: string
): GideonFocusBlock | null {
  const lines = content.split(/\r?\n/);
  const i = lines.findIndex((line) => SECTION_START.test(line.trim()));
  if (i < 0) return null;

  const fields: Record<string, string> = {};
  for (let j = i + 1; j < lines.length; j++) {
    const line = lines[j]!.trim();
    if (!line) continue;
    if (/^#{1,3}\s+/.test(line)) break;
    const m = /^(label|date|time|end|startsAt|endsAt)\s*:\s*(.+)$/i.exec(line);
    if (m) fields[m[1]!.toLowerCase()] = m[2]!.trim();
  }

  const label = (fields.label ?? "Focus block").trim().slice(0, 80) || "Focus block";
  if (fields.endsat && fields.startsat) {
    const candidate = {
      label,
      startsAt: fields.startsat,
      endsAt: fields.endsat,
    };
    return isValidFocusBlock(candidate) ? candidate : null;
  }
  if (fields.end && Date.parse(fields.end)) {
    const candidate = {
      label,
      startsAt: now.toISOString(),
      endsAt: new Date(fields.end).toISOString(),
    };
    return isValidFocusBlock(candidate) ? candidate : null;
  }

  const date = (fields.date ?? calendarDateInZone(now, timeZone)).trim();
  const time = toHhMm(fields.time ?? "");
  if (!time) return null;
  const endsAt = zonedDateTimeToIso({ date, time, timeZone });
  if (!endsAt) return null;
  const candidate = {
    label,
    startsAt: now.toISOString(),
    endsAt,
  };
  return isValidFocusBlock(candidate) ? candidate : null;
}

function parseEndingAt(
  content: string,
  now: Date,
  timeZone: string
): GideonFocusBlock | null {
  if (
    !/\b(minutes? left|time left|countdown|work block|focus block)\b/i.test(
      content
    )
  ) {
    return null;
  }
  const match = ENDING_AT.exec(content);
  if (!match?.[1]) return null;
  const endsAt = wallClockToIso(match[1], now, timeZone);
  if (!endsAt) return null;
  const endMs = Date.parse(endsAt);
  if (!Number.isFinite(endMs) || endMs <= now.getTime() + 15_000) return null;
  return {
    label: "Focus block",
    startsAt: now.toISOString(),
    endsAt,
  };
}

export function parseFocusBlockStart(
  question: string,
  now: Date = new Date(),
  timeZone: string = GUARDIAN_TIME_ZONE,
  lastAssistant?: string
): GideonFocusBlock | null {
  const q = question.trim();
  if (!wantsFocusBlockStart(q) && !ENDING_AT.test(q) && !DURATION.test(q)) {
    return null;
  }
  if (!wantsFocusBlockStart(q) && !/\b(block|focus|90\s*\/\s*20|session)\b/i.test(q)) {
    return null;
  }

  const label = parseLabel(q);
  const until = ENDING_AT.exec(q);
  if (until?.[1]) {
    const endsAt = wallClockToIso(until[1], now, timeZone);
    if (endsAt && Date.parse(endsAt) > now.getTime() + 15_000) {
      return { label, startsAt: now.toISOString(), endsAt };
    }
  }

  const durationMinutes = parseDurationMinutes(q);
  if (durationMinutes && durationMinutes >= 5 && durationMinutes <= 8 * 60) {
    return {
      label,
      startsAt: now.toISOString(),
      endsAt: new Date(now.getTime() + durationMinutes * 60_000).toISOString(),
    };
  }

  if (lastAssistant && /\b(first|this|the) block\b/i.test(q)) {
    const fromPlan = parseCurrentRangeFromSchedule(lastAssistant, now, timeZone);
    if (fromPlan) return { ...fromPlan, label: fromPlan.label || label };
  }

  return null;
}

function parseLabel(question: string): string {
  const forMatch = /\b(?:for|on)\s+([^,.!?]{2,60})$/i.exec(question.trim());
  if (forMatch?.[1] && !/\b(me|now|today)\b/i.test(forMatch[1])) {
    return forMatch[1].trim().slice(0, 80);
  }
  if (NINETY_TWENTY.test(question)) return "90/20 focus";
  return "Focus block";
}

function parseDurationMinutes(question: string): number | null {
  if (NINETY_TWENTY.test(question) && !DURATION.test(question)) return 90;
  const match = DURATION.exec(question);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = match[3]!.toLowerCase();
  if (unit.startsWith("hour") || unit.startsWith("hr")) return Math.round(n * 60);
  return Math.round(n);
}

/** First schedule range that still contains `now`, else the next upcoming range. */
function parseCurrentRangeFromSchedule(
  assistant: string,
  now: Date,
  timeZone: string
): GideonFocusBlock | null {
  const rangeRe =
    /(\d{1,2}(?::\d{2})?)\s*[–—-]\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/gi;
  const candidates: GideonFocusBlock[] = [];
  let match: RegExpExecArray | null;
  while ((match = rangeRe.exec(assistant))) {
    const meridiem = /a\.?m\.?|p\.?m\.?/i.exec(match[2] ?? "")?.[0] ?? "";
    const startRaw = `${match[1]}${meridiem ? ` ${meridiem}` : ""}`;
    const endRaw = match[2] ?? "";
    const startsAt = wallClockToIso(startRaw, now, timeZone);
    const endsAt = wallClockToIso(endRaw, now, timeZone);
    if (!startsAt || !endsAt) continue;
    if (Date.parse(endsAt) <= Date.parse(startsAt)) continue;
    candidates.push({
      label: "Focus block",
      startsAt,
      endsAt,
    });
  }
  const nowMs = now.getTime();
  const current = candidates.find(
    (b) => Date.parse(b.startsAt) <= nowMs && Date.parse(b.endsAt) > nowMs
  );
  return current ?? candidates.find((b) => Date.parse(b.endsAt) > nowMs) ?? null;
}

function wallClockToIso(
  raw: string,
  now: Date,
  timeZone: string
): string | null {
  const hhmm = toHhMm(raw);
  if (!hhmm) return null;
  const date = calendarDateInZone(now, timeZone);
  let iso = zonedDateTimeToIso({ date, time: hhmm, timeZone });
  if (!iso) return null;
  if (Date.parse(iso) <= now.getTime() - 120_000 && !/[ap]\.?m\.?/i.test(raw)) {
    const [h, m] = hhmm.split(":").map(Number);
    if (h != null && h > 0 && h < 12) {
      const later = `${String(h + 12).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`;
      iso = zonedDateTimeToIso({ date, time: later, timeZone }) ?? iso;
    }
  }
  return iso;
}

function toHhMm(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m =
    /^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i.exec(trimmed);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? "0");
  const mer = (m[3] ?? "").toLowerCase().replace(/\./g, "");
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) {
    return null;
  }
  if (mer.startsWith("p") && hour < 12) hour += 12;
  if (mer.startsWith("a") && hour === 12) hour = 0;
  if (hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function readStoredFocusBlock(): GideonFocusBlock | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FOCUS_BLOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidFocusBlock(parsed)) return null;
    if (remainingMs(parsed) < -2 * 60 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredFocusBlock(block: GideonFocusBlock | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!block) {
      window.localStorage.removeItem(FOCUS_BLOCK_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(FOCUS_BLOCK_STORAGE_KEY, JSON.stringify(block));
  } catch {
    /* ignore quota / private mode */
  }
}

export function latestFocusBlockFromMessages(
  messages: Array<{ role: string; content: string }>,
  timeZone: string,
  now: Date = new Date()
): GideonFocusBlock | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.role !== "assistant") continue;
    const block = parseFocusBlockFromAssistant(msg.content, now, timeZone);
    if (block && remainingMs(block, now) > -60_000) return block;
  }
  return null;
}
