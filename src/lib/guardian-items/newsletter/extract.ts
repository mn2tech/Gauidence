/**
 * Deterministic school-newsletter structured extraction (pure).
 * Creates explicit no_homework records and resolves weekday homework dates.
 */

import type { GuardianExtractedItem } from "../schema";
import type { GuardianItemType } from "../types";
import {
  dateForWeekdayInWeek,
  extractPublicationDate,
  parseEventTimesOnDate,
  parseLooseNewsletterDate,
  resolveHomeworkWeekStart,
} from "./dates";

export type NewsletterExtractionMeta = {
  publicationDate: string | null;
  homeworkWeekStart: string | null;
  teacherName: string | null;
  schoolName: string | null;
  spellingWords: string[];
};

export type NewsletterExtractionResult = {
  items: GuardianExtractedItem[];
  meta: NewsletterExtractionMeta;
};

const WEEKDAY =
  /\b(monday|tuesday|wednesday|thursday|friday)\b/i;

function pushItem(
  items: GuardianExtractedItem[],
  seen: Set<string>,
  item: GuardianExtractedItem
) {
  const key = [
    item.type,
    item.event_date ?? item.due_at ?? "",
    item.title.toLowerCase(),
  ].join("|");
  if (seen.has(key)) return;
  seen.add(key);
  items.push(item);
}

function detectTeacher(text: string): string | null {
  const m =
    /\b((?:mr|mrs|ms|miss|dr)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i.exec(
      text
    );
  if (!m?.[1]) return null;
  // Normalize casing: Mrs. Sellner
  return m[1]
    .replace(/\b(mr|mrs|ms|miss|dr)\b\.?/i, (title) => {
      const t = title.replace(/\./g, "").toLowerCase();
      const labeled =
        t === "mrs"
          ? "Mrs."
          : t === "mr"
            ? "Mr."
            : t === "ms"
              ? "Ms."
              : t === "miss"
                ? "Miss"
                : "Dr.";
      return labeled;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function detectSchool(text: string): string | null {
  const m =
    /\b([A-Z][A-Za-z0-9'’&\-]+(?:\s+[A-Z][A-Za-z0-9'’&\-]+){0,4}\s+(?:Elementary|Middle|High)\s+School)\b/.exec(
      text
    );
  return m?.[1]?.trim() ?? null;
}

function extractSpellingWords(text: string): string[] {
  const section =
    /(?:word\s+list|spelling\s+(?:words?|list)|this\s+week'?s?\s+words?)[:\s]*([\s\S]{0,1200}?)(?=\n\s*\n|\bhomework\b|\bupcoming\b|\bannouncements?\b|$)/i.exec(
      text
    );
  const blob = section?.[1] ?? "";
  if (!blob.trim()) return [];

  const words: string[] = [];
  const seen = new Set<string>();

  // Numbered or bulleted lists
  for (const m of blob.matchAll(
    /(?:^|\n)\s*(?:\d+[.)]\s*|[-•*]\s*)([A-Za-z][A-Za-z'-]{1,24})\b/g
  )) {
    const w = m[1]!.toLowerCase();
    if (!seen.has(w)) {
      seen.add(w);
      words.push(m[1]!);
    }
  }

  if (words.length >= 5) return words.slice(0, 40);

  // Comma / whitespace separated after a label
  const inline = blob
    .replace(/\d+[.)]/g, " ")
    .split(/[,;\n|/]+/)
    .map((w) => w.trim())
    .filter((w) => /^[A-Za-z][A-Za-z'-]{1,24}$/.test(w));

  for (const w of inline) {
    const key = w.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      words.push(w);
    }
  }

  return words.slice(0, 40);
}

function classifyDatedLine(
  title: string,
  description: string
): { type: GuardianItemType; requiresAction: boolean } {
  const blob = `${title} ${description}`.toLowerCase();
  if (/\b(no school|schools?\s+closed|holiday|labor day|memorial day)\b/.test(blob)) {
    return { type: "no_school", requiresAction: false };
  }
  if (/\b(half[\s-]?day|early\s+dismissal|early\s+release|pickup)\b/.test(blob)) {
    return { type: "early_dismissal", requiresAction: true };
  }
  if (/\b(test|quiz|exam)\b/.test(blob)) {
    return { type: "test", requiresAction: true };
  }
  if (/\b(study|review)\b/.test(blob)) {
    return { type: "study_reminder", requiresAction: true };
  }
  return { type: "school_event", requiresAction: false };
}

/**
 * Extract structured Guardian items from school newsletter text.
 */
export function extractSchoolNewsletterItems(args: {
  sourceText: string;
  title?: string | null;
  childReference?: string | null;
  today?: string | null;
}): NewsletterExtractionResult {
  const text = args.sourceText.replace(/\r\n/g, "\n").slice(0, 20_000);
  const items: GuardianExtractedItem[] = [];
  const seen = new Set<string>();

  const publicationDate = extractPublicationDate(text);
  const teacherName = detectTeacher(text);
  const schoolName = detectSchool(text);
  const spellingWords = extractSpellingWords(text);

  const eventDates: string[] = [];
  const datedLineRe =
    /\b((?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s*20\d{2})(?:[,\s]+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?(?:\s*[–—-]\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))?))?\s*[—–\-:]\s*(.+)/gi;

  for (const m of text.matchAll(datedLineRe)) {
    const date = parseLooseNewsletterDate(m[1]!);
    if (!date) continue;
    eventDates.push(date);
    const rest = (m[3] ?? "").trim();
    const timeBlob = m[2] ?? rest;
    const times = parseEventTimesOnDate(date, `${m[2] ?? ""} ${rest}`);
    const title = rest
      .replace(
        /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)(?:\s*[–—-]\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))?\s*[—–\-:,]?\s*/i,
        ""
      )
      .trim()
      .slice(0, 300);
    if (!title) continue;

    const kind = classifyDatedLine(title, rest);
    const type =
      kind.type === "no_school"
        ? ("no_school" as const)
        : kind.type;

    // Also emit legacy school_closure for no_school so Watch/Today keep working
    // for older consumers; primary type is no_school.
    pushItem(items, seen, {
      type,
      title: title.slice(0, 300),
      description: rest.slice(0, 1000),
      event_date: date,
      due_at: null,
      start_at: times.startAt,
      end_at: times.endAt,
      requires_action: kind.requiresAction,
      priority: kind.type === "early_dismissal" || kind.type === "test" ? "high" : "normal",
      child_reference: args.childReference ?? null,
      confidence: 0.95,
      source_excerpt: m[0]!.slice(0, 500),
      metadata: {
        newsletter: true,
        publication_date: publicationDate,
        time_label: times.label,
      },
    });
  }

  const homeworkWeekStart = resolveHomeworkWeekStart({
    publicationDate,
    eventDates,
    today: args.today ?? null,
  });

  const homeworkLineRe =
    /(?:^|\n)\s*(monday|tuesday|wednesday|thursday|friday)\s*[—–\-:]\s*(.+?)(?=\n|$)/gi;

  for (const m of text.matchAll(homeworkLineRe)) {
    const weekday = m[1]!.toLowerCase();
    const body = m[2]!.trim();
    if (!body) continue;
    // Skip if this is part of a full-date line already captured
    if (/20\d{2}/.test(body) && body.length > 80) continue;

    const eventDate = homeworkWeekStart
      ? dateForWeekdayInWeek(homeworkWeekStart, weekday)
      : null;

    const isNoHomework = /\bno\s+homework\b/i.test(body);
    const isStudy =
      /\bstudy\b/i.test(body) || /\breview\s+for\b/i.test(body);
    const isTest =
      /\b(test|quiz|exam)\b/i.test(body) && !isNoHomework && !isStudy;

    let type: GuardianItemType = "homework";
    if (isNoHomework) type = "no_homework";
    else if (isStudy) type = "study_reminder";
    else if (isTest) type = "test";

    const title = isNoHomework
      ? `No homework (${weekday.charAt(0).toUpperCase()}${weekday.slice(1)})`
      : body.slice(0, 300);

    pushItem(items, seen, {
      type,
      title,
      description: `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} — ${body}`.slice(
        0,
        1000
      ),
      event_date: eventDate,
      due_at: eventDate,
      start_at: null,
      end_at: null,
      requires_action: !isNoHomework,
      priority: isStudy || isTest ? "high" : isNoHomework ? "normal" : "normal",
      child_reference: args.childReference ?? null,
      confidence: eventDate ? 0.93 : 0.7,
      source_excerpt: m[0]!.trim().slice(0, 500),
      metadata: {
        newsletter: true,
        weekday,
        publication_date: publicationDate,
        homework_week_start: homeworkWeekStart,
      },
    });
  }

  if (spellingWords.length > 0) {
    pushItem(items, seen, {
      type: "spelling_list",
      title: `Spelling list (${spellingWords.length} words)`,
      description: spellingWords.join(", ").slice(0, 1000),
      event_date: homeworkWeekStart
        ? dateForWeekdayInWeek(homeworkWeekStart, "friday")
        : publicationDate,
      due_at: null,
      start_at: null,
      end_at: null,
      requires_action: false,
      priority: "low",
      child_reference: args.childReference ?? null,
      confidence: 0.92,
      source_excerpt: `Word list: ${spellingWords.slice(0, 8).join(", ")}`.slice(
        0,
        500
      ),
      metadata: {
        newsletter: true,
        spelling_words: spellingWords,
        publication_date: publicationDate,
      },
    });
  }

  if (teacherName) {
    const email =
      /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i.exec(text)?.[1] ?? null;
    pushItem(items, seen, {
      type: "school_contact",
      title: teacherName,
      description: email ? `Teacher contact: ${email}` : "Classroom teacher",
      event_date: null,
      due_at: null,
      start_at: null,
      end_at: null,
      requires_action: false,
      priority: "low",
      child_reference: args.childReference ?? null,
      confidence: 0.9,
      source_excerpt: teacherName.slice(0, 500),
      metadata: {
        newsletter: true,
        contact_email: email,
        role: "teacher",
      },
    });
  }

  // Generic announcements (non-dated) — keep sparse
  if (
    /\bimportant\s+announcement\b/i.test(text) ||
    /\bplease\s+note\b/i.test(text)
  ) {
    const ann =
      /(?:important\s+announcement|please\s+note)\s*[:\-—–]?\s*(.+)/i.exec(
        text
      );
    if (ann?.[1]) {
      pushItem(items, seen, {
        type: "announcement",
        title: ann[1].trim().slice(0, 120),
        description: ann[1].trim().slice(0, 1000),
        event_date: null,
        due_at: null,
        start_at: null,
        end_at: null,
        requires_action: false,
        priority: "low",
        child_reference: args.childReference ?? null,
        confidence: 0.8,
        source_excerpt: ann[0].slice(0, 500),
        metadata: { newsletter: true },
      });
    }
  }

  void WEEKDAY; // reserved for future section scanners

  return {
    items,
    meta: {
      publicationDate,
      homeworkWeekStart,
      teacherName,
      schoolName,
      spellingWords,
    },
  };
}
