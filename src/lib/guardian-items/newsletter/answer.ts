/**
 * Deterministic school-day answers for Gideon (structured items first).
 */

import { addCalendarDays } from "../dates";
import { formatTimeRangeLabel } from "./dates";

export type SchoolAnswerItem = {
  id?: string;
  type: string;
  title: string;
  description?: string | null;
  event_date: string | null;
  start_at?: string | null;
  end_at?: string | null;
  status?: string | null;
  child_name?: string | null;
  source_document_id?: string | null;
  source_excerpt?: string | null;
  metadata?: Record<string, unknown> | null;
};

const SCHOOL_DAY_QUESTION =
  /\b(what does \w+ have (?:today|tomorrow)|does \w+ have homework|homework(?:\s+today)?|prepare for tomorrow|what(?:'s| is) (?:on )?(?:today|tomorrow)|spelling words|school picnic|pickup|half[\s-]?day)\b/i;

const SPELLING_QUESTION = /\bspelling\s+words?\b/i;
const HISTORY_QUESTION =
  /\b(last week|history|already (?:done|completed)|past assignments?)\b/i;

export function wantsSchoolStructuredAnswer(question: string): boolean {
  return SCHOOL_DAY_QUESTION.test(question.trim());
}

export function wantsSpellingList(question: string): boolean {
  return SPELLING_QUESTION.test(question.trim());
}

export function wantsSchoolHistory(question: string): boolean {
  return HISTORY_QUESTION.test(question.trim());
}

function isActiveRelevant(item: SchoolAnswerItem, today: string): boolean {
  if (item.status && !["active", undefined, null].includes(item.status)) {
    if (item.status === "completed" || item.status === "expired" || item.status === "superseded" || item.status === "dismissed") {
      return false;
    }
  }
  if (!item.event_date) {
    return item.type === "spelling_list" || item.type === "school_contact";
  }
  // Keep today, tomorrow, and near-term; drop past dated items
  return item.event_date >= today;
}

function displayTitle(item: SchoolAnswerItem): string {
  if (item.type === "no_homework") return "no homework";
  if (item.type === "no_school") return item.title.replace(/^No school[ —–-]*/i, "") || item.title;
  return item.title
    .replace(/\s*\((?:monday|tuesday|wednesday|thursday|friday)\)\s*$/i, "")
    .trim();
}

/**
 * Build the preferred plain-language answer for school day questions.
 * Returns null when structured items cannot confidently answer.
 */
export function formatSchoolDayAnswer(args: {
  question: string;
  childName: string;
  today: string;
  items: SchoolAnswerItem[];
}): { answer: string; citationDocumentIds: string[] } | null {
  const child = args.childName.trim() || "your child";
  const today = args.today;
  const tomorrow = addCalendarDays(today, 1);
  const q = args.question.trim();

  const relevant = args.items.filter((i) => isActiveRelevant(i, today));

  if (wantsSpellingList(q)) {
    const list = relevant.find((i) => i.type === "spelling_list");
    const words = (list?.metadata?.spelling_words as string[] | undefined) ?? [];
    if (words.length === 0 && list?.description) {
      return {
        answer: `${child}'s spelling words: ${list.description}.`,
        citationDocumentIds: list.source_document_id
          ? [list.source_document_id]
          : [],
      };
    }
    if (words.length === 0) return null;
    return {
      answer: `${child}'s spelling words: ${words.join(", ")}.`,
      citationDocumentIds: list?.source_document_id
        ? [list.source_document_id]
        : [],
    };
  }

  const todayItems = relevant.filter((i) => i.event_date === today);
  const tomorrowItems = relevant.filter((i) => i.event_date === tomorrow);

  const todayNoHomework = todayItems.some((i) => i.type === "no_homework");
  const todayHomework = todayItems.filter(
    (i) => i.type === "homework" || i.type === "task"
  );
  const todayTests = todayItems.filter((i) => i.type === "test");
  const todayEvents = todayItems.filter(
    (i) =>
      i.type === "school_event" ||
      i.type === "event" ||
      i.type === "early_dismissal" ||
      i.type === "no_school" ||
      i.type === "school_closure"
  );

  const tomorrowPrep = tomorrowItems.filter(
    (i) =>
      i.type === "study_reminder" ||
      i.type === "test" ||
      i.type === "school_event" ||
      i.type === "event" ||
      i.type === "early_dismissal" ||
      i.type === "homework"
  );

  // Prefer the acceptance-style concise answer when we have today + tomorrow signals
  const parts: string[] = [];
  const citations = new Set<string>();

  const collectCite = (list: SchoolAnswerItem[]) => {
    for (const i of list) {
      if (i.source_document_id) citations.add(i.source_document_id);
    }
  };

  if (todayNoHomework) {
    parts.push(`${child} has no homework today`);
    collectCite(todayItems.filter((i) => i.type === "no_homework"));
  } else if (todayHomework.length > 0) {
    parts.push(
      `${child}'s homework today: ${todayHomework.map(displayTitle).join("; ")}`
    );
    collectCite(todayHomework);
  } else if (
    /\b(homework|what does \w+ have today)\b/i.test(q) &&
    todayItems.length === 0 &&
    tomorrowPrep.length === 0
  ) {
    return null;
  }

  if (todayTests.length > 0) {
    parts.push(
      `test today: ${todayTests.map(displayTitle).join("; ")}`
    );
    collectCite(todayTests);
  }

  if (todayEvents.length > 0) {
    for (const ev of todayEvents) {
      const time = formatTimeRangeLabel(ev.start_at ?? null, ev.end_at ?? null);
      parts.push(
        time
          ? `${displayTitle(ev)} today (${time})`
          : `${displayTitle(ev)} today`
      );
      collectCite([ev]);
    }
  }

  const tomorrowEvent = tomorrowPrep.find(
    (i) => i.type === "school_event" || i.type === "event"
  );
  const tomorrowStudy = tomorrowPrep.find(
    (i) => i.type === "study_reminder" || i.type === "test"
  );

  if (tomorrowEvent) {
    const time =
      (typeof tomorrowEvent.metadata?.time_label === "string"
        ? tomorrowEvent.metadata.time_label
        : null) ||
      formatTimeRangeLabel(
        tomorrowEvent.start_at ?? null,
        tomorrowEvent.end_at ?? null
      );
    const name = displayTitle(tomorrowEvent);
    if (time) {
      // Prefer "7:00–9:00 PM" compact form
      const compact = time
        .replace(/\s*PM\s*–\s*/i, "–")
        .replace(/\s*AM\s*–\s*/i, "–")
        .replace(/(\d+:\d+)\s+PM–(\d+:\d+)\s+PM/i, "$1–$2 PM")
        .replace(/(\d+:\d+)\s+AM–(\d+:\d+)\s+AM/i, "$1–$2 AM")
        .replace(/(\d+:\d+)\s+PM–(\d+:\d+)\s+PM/i, "$1–$2 PM");
      parts.push(`Tomorrow is ${name} from ${compact}`);
    } else {
      parts.push(`Tomorrow is ${name}`);
    }
    collectCite([tomorrowEvent]);
  }

  if (tomorrowStudy) {
    const studyText = displayTitle(tomorrowStudy);
    const spelling = /\bspelling\b/i.test(studyText);
    if (parts.length > 0 && /tomorrow is /i.test(parts[parts.length - 1] ?? "")) {
      const last = parts.pop()!;
      parts.push(
        spelling
          ? `${last}, and he should study for his spelling test`
          : `${last}, and he should ${studyText.replace(/^study\s+for\s+/i, "study for ")}`
      );
    } else {
      parts.push(
        spelling
          ? `${child} should study for his spelling test`
          : `${child} should ${studyText}`
      );
    }
    collectCite([tomorrowStudy]);
  } else if (!tomorrowEvent) {
    for (const prep of tomorrowPrep.slice(0, 2)) {
      parts.push(`Tomorrow: ${displayTitle(prep)}`);
      collectCite([prep]);
    }
  }

  if (parts.length === 0) return null;

  let answer = parts.join(". ");
  if (!answer.endsWith(".")) answer += ".";
  answer = answer.replace(/\s+/g, " ").trim();

  return {
    answer,
    citationDocumentIds: [...citations],
  };
}

/** Filter Watch/Today school noise: hide full spelling lists unless asked. */
export function shouldSurfaceSchoolItemInToday(args: {
  type: string;
  eventDate: string | null;
  today: string;
  status?: string | null;
}): boolean {
  if (
    args.status === "completed" ||
    args.status === "expired" ||
    args.status === "superseded" ||
    args.status === "dismissed"
  ) {
    return false;
  }
  if (args.type === "spelling_list") return false;
  if (args.type === "school_contact") return false;
  if (args.type === "announcement") return false;
  if (!args.eventDate) return false;
  if (args.eventDate < args.today) return false;

  const tomorrow = addCalendarDays(args.today, 1);
  // Today + tomorrow prep + near-term schedule changes (7 days)
  if (args.eventDate === args.today || args.eventDate === tomorrow) return true;
  if (
    args.type === "early_dismissal" ||
    args.type === "no_school" ||
    args.type === "school_closure" ||
    args.type === "test" ||
    args.type === "school_event" ||
    args.type === "event"
  ) {
    return args.eventDate <= addCalendarDays(args.today, 7);
  }
  return false;
}
