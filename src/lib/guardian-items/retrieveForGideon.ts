import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveNow } from "@/lib/clock";
import { calendarDateInUserZone } from "@/lib/timezone";
import { addCalendarDays, effectiveCalendarDate } from "./dates";
import {
  formatTemporalHeader,
  isCurrentlyActionable,
  partitionLifecycleStatus,
  partitionTemporalItems,
  temporalSummaryLine,
  type TemporalMetadata,
  type TemporalPartition,
} from "./lifecycle";
import { reevaluateItemLifecycle } from "./lifecycle-transitions";
import {
  formatSchoolDayAnswer,
  wantsSchoolHistory,
  wantsSchoolStructuredAnswer,
  wantsSpellingList,
  type SchoolAnswerItem,
} from "./newsletter/answer";
import type { GuardianItemRow } from "./types";

export type GideonGuardianItem = {
  id: string;
  space_id: string;
  child_id: string | null;
  type: string;
  title: string;
  effective_date: string | null;
  requires_action: boolean;
  priority: string;
  space_name: string | null;
  child_name: string | null;
  source_excerpt: string | null;
  source_document_id?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  description?: string | null;
  metadata?: GuardianItemRow["metadata"];
  temporal?: TemporalMetadata | null;
  partition?: TemporalPartition;
};

const SCHEDULE_INTENT =
  /\b(schedule|calendar|remind(?:er)?s?|upcoming|attention|deadline|due|what(?:'s| is) (?:on|coming)|this week|next week|tomorrow|today|what do i need|needs? (?:my )?attention|closed|closure|homework|spelling|picnic|pickup|half[\s-]?day|what does \w+ have)\b/i;

const HISTORICAL_INTENT =
  /\b(who (?:did|has|have) (?:i |we )?rsvp|who rsvped|who rsvp'?d|what happened|who did i meet|follow[- ]?ups?|histor(?:y|ical)|past event|last (?:year|month|week))\b/i;

const CHILD_NAME_IN_QUESTION =
  /\b(?:what does|does|show|for)\s+([A-Z][a-z]+)\b|\b([A-Z][a-z]+)(?:'s)?\s+(?:homework|spelling|school|today|tomorrow)\b/;

export function wantsGuardianItemRetrieval(question: string): boolean {
  return (
    SCHEDULE_INTENT.test(question.trim()) ||
    wantsSchoolStructuredAnswer(question)
  );
}

export function wantsHistoricalGuardianContext(question: string): boolean {
  return HISTORICAL_INTENT.test(question.trim()) || wantsSchoolHistory(question);
}

export function extractChildNameFromQuestion(question: string): string | null {
  const m = CHILD_NAME_IN_QUESTION.exec(question.trim());
  if (!m) return null;
  return (m[1] || m[2] || "").trim() || null;
}

export function scoreGuardianItemRelevance(
  item: GideonGuardianItem,
  question: string
): number {
  const q = question.trim().toLowerCase();
  if (!q) return 1;
  let score = 1;
  const title = item.title.toLowerCase();
  for (const token of q.split(/\W+/).filter((t) => t.length >= 3)) {
    if (title.includes(token)) score += 3;
    if (item.child_name?.toLowerCase().includes(token)) score += 4;
    if (item.space_name?.toLowerCase().includes(token)) score += 2;
  }
  if (SCHEDULE_INTENT.test(q)) score += 2;
  if (item.requires_action && /\b(need|do|deadline|due|attention)\b/i.test(q)) {
    score += 2;
  }

  // Prefer structured school items for school questions
  if (wantsSchoolStructuredAnswer(q)) {
    if (
      [
        "no_homework",
        "homework",
        "test",
        "study_reminder",
        "school_event",
        "early_dismissal",
        "no_school",
        "spelling_list",
      ].includes(item.type)
    ) {
      score += 6;
    }
    if (item.effective_date) {
      // Boost today/tomorrow heavily
      score += 2;
    }
  }

  if (item.temporal && isCurrentlyActionable(item.temporal)) score += 1;
  if (
    item.temporal?.actionability === "expired" &&
    !wantsHistoricalGuardianContext(question)
  ) {
    score -= 5;
  }
  if (item.type === "spelling_list" && !wantsSpellingList(q)) {
    score -= 4;
  }
  return score;
}

/** Structured Guardian items for Ask Gideon (prefer over re-extracting from docs). */
export async function retrieveGuardianItemsForGideon(
  supabase: SupabaseClient,
  args: {
    spaceIds: string[];
    profileNames?: Record<string, string>;
    question: string;
    timeZone: string;
    limit?: number;
    horizonDays?: number;
    childNameFilter?: string | null;
    now?: Date;
  }
): Promise<GideonGuardianItem[]> {
  const limit = args.limit ?? 16;
  const horizonDays = args.horizonDays ?? 120;
  const scopeIds = [...new Set(args.spaceIds)].filter(Boolean);
  if (scopeIds.length === 0) return [];

  const now = resolveNow(args.now);
  const today = calendarDateInUserZone(now, args.timeZone);
  const horizonEnd = addCalendarDays(today, horizonDays);
  const allowHistorical = wantsHistoricalGuardianContext(args.question);
  const childFromQuestion =
    args.childNameFilter?.trim() ||
    extractChildNameFromQuestion(args.question);

  const { data, error } = await supabase
    .from("guardian_items")
    .select(
      "id, space_id, child_id, type, title, description, event_date, start_at, end_at, due_at, requires_action, priority, source_excerpt, source_document_id, status, action_label, confidence, metadata"
    )
    .in("space_id", scopeIds)
    .in(
      "status",
      allowHistorical
        ? ["active", "completed", "expired", "superseded"]
        : ["active"]
    )
    .limit(120);

  if (error || !data) return [];

  const childIds = [
    ...new Set(
      (data as GuardianItemRow[])
        .map((r) => r.child_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const nameMap: Record<string, string> = { ...(args.profileNames ?? {}) };
  if (childIds.length > 0) {
    const missing = childIds.filter((id) => !nameMap[id]);
    if (missing.length > 0) {
      const { data: children } = await supabase
        .from("guardian_profiles")
        .select("id, display_name")
        .in("id", missing);
      for (const c of children ?? []) {
        nameMap[c.id] = c.display_name;
      }
    }
  }

  const childFilter = childFromQuestion?.trim().toLowerCase() ?? null;

  const items: GideonGuardianItem[] = [];
  for (const row of data as GuardianItemRow[]) {
    const reeval = reevaluateItemLifecycle(row, {
      now,
      timeZone: args.timeZone,
    });
    const temporal = reeval.temporal;

    if (
      !allowHistorical &&
      (temporal.actionability === "expired" ||
        temporal.lifecycleStatus === "expired" ||
        row.status === "superseded")
    ) {
      continue;
    }

    // Hide completed/expired unless history asked
    if (
      !allowHistorical &&
      (row.status === "completed" || row.status === "expired")
    ) {
      continue;
    }

    const effective = effectiveCalendarDate({
      eventDate: row.event_date,
      dueAt: row.due_at,
      timeZone: args.timeZone,
      calendarDateInZone: calendarDateInUserZone,
    });

    // For school day questions, prefer today/tomorrow window tightly
    if (wantsSchoolStructuredAnswer(args.question) && !allowHistorical) {
      if (
        effective &&
        effective < today &&
        row.type !== "spelling_list" &&
        row.type !== "school_contact"
      ) {
        continue;
      }
      if (
        effective &&
        effective > addCalendarDays(today, 14) &&
        row.type !== "spelling_list"
      ) {
        continue;
      }
    } else if (effective && effective > horizonEnd && !allowHistorical) {
      continue;
    }

    const childName = row.child_id ? nameMap[row.child_id] ?? null : null;
    if (childFilter && childName) {
      const cn = childName.toLowerCase();
      if (
        !cn.includes(childFilter) &&
        !childFilter.includes(cn.split(/\s+/)[0]!)
      ) {
        continue;
      }
    } else if (childFilter && !childName) {
      // Multi-child isolation: skip unscoped items when a child was named
      continue;
    }

    items.push({
      id: row.id,
      space_id: row.space_id,
      child_id: row.child_id,
      type: row.type,
      title: row.title,
      effective_date: effective,
      requires_action: row.requires_action && isCurrentlyActionable(temporal),
      priority: row.priority,
      space_name: nameMap[row.space_id] ?? null,
      child_name: childName,
      source_excerpt: row.source_excerpt,
      source_document_id: row.source_document_id,
      start_at: row.start_at,
      end_at: row.end_at,
      description: row.description,
      metadata: row.metadata,
      temporal,
      partition: partitionLifecycleStatus(temporal.lifecycleStatus),
    });
  }

  items.sort(
    (a, b) =>
      scoreGuardianItemRelevance(b, args.question) -
      scoreGuardianItemRelevance(a, args.question)
  );

  return items.slice(0, limit);
}

/**
 * Deterministic school answer from structured items (preferred Gideon path).
 */
export async function answerSchoolQuestionFromItems(
  supabase: SupabaseClient,
  args: {
    spaceIds: string[];
    profileNames?: Record<string, string>;
    question: string;
    timeZone: string;
    now?: Date;
  }
): Promise<{
  answer: string;
  citations: {
    documentId: string;
    fileName: string;
    excerpt: string | null;
  }[];
} | null> {
  if (!wantsSchoolStructuredAnswer(args.question)) return null;

  const now = resolveNow(args.now);
  const today = calendarDateInUserZone(now, args.timeZone);
  const childName = extractChildNameFromQuestion(args.question);
  const items = await retrieveGuardianItemsForGideon(supabase, {
    ...args,
    childNameFilter: childName,
    limit: 40,
    horizonDays: 30,
    now,
  });

  if (items.length === 0) return null;

  const schoolItems: SchoolAnswerItem[] = items.map((i) => ({
    id: i.id,
    type: i.type,
    title: i.title,
    description: i.description,
    event_date: i.effective_date,
    start_at: i.start_at,
    end_at: i.end_at,
    status: "active",
    child_name: i.child_name,
    source_document_id: i.source_document_id,
    source_excerpt: i.source_excerpt,
    metadata: i.metadata as Record<string, unknown> | null,
  }));

  const displayChild =
    childName ||
    schoolItems.find((i) => i.child_name)?.child_name ||
    "Your child";

  const formatted = formatSchoolDayAnswer({
    question: args.question,
    childName: displayChild,
    today,
    items: schoolItems,
  });

  if (!formatted) return null;

  const citations: {
    documentId: string;
    fileName: string;
    excerpt: string | null;
  }[] = [];

  if (formatted.citationDocumentIds.length > 0) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, file_name")
      .in("id", formatted.citationDocumentIds);
    for (const doc of docs ?? []) {
      const excerpt =
        schoolItems.find((i) => i.source_document_id === doc.id)
          ?.source_excerpt ?? null;
      citations.push({
        documentId: doc.id,
        fileName: doc.file_name ?? "School newsletter",
        excerpt,
      });
    }
  }

  return { answer: formatted.answer, citations };
}

export function formatGuardianItemsForGideon(
  items: GideonGuardianItem[],
  options?: { now?: Date; timeZone?: string }
): string {
  if (items.length === 0) return "(none)";

  const now = resolveNow(options?.now);
  const timeZone = options?.timeZone ?? "UTC";
  const partitioned = partitionTemporalItems(
    items.map((i) => ({ ...i, temporal: i.temporal ?? undefined }))
  );

  const summaryLines = items
    .filter((i) => i.temporal)
    .slice(0, 8)
    .map((i) =>
      temporalSummaryLine({ title: i.title, temporal: i.temporal! })
    );

  const header = formatTemporalHeader({ now, timeZone, lines: summaryLines });
  const sections: string[] = [
    header,
    "",
    "SCHOOL / SCHEDULE PRIORITY: Prefer structured items below over document OCR for homework, no-homework, tests, and school events. Answer directly — do not begin with 'Looking at the images' or 'Based on documents'. Cite the source document briefly after the answer.",
    "",
  ];

  const render = (label: string, list: GideonGuardianItem[]) => {
    if (list.length === 0) return;
    sections.push(`${label}:`);
    for (const item of list) {
      const who = [item.child_name, item.space_name]
        .filter(Boolean)
        .join(" · ");
      const when = item.effective_date ?? "date TBD";
      const life = item.temporal?.lifecycleStatus
        ? ` [${item.temporal.lifecycleStatus}]`
        : "";
      const action =
        item.requires_action &&
        item.temporal &&
        isCurrentlyActionable(item.temporal)
          ? " — needs action"
          : item.temporal?.actionability === "follow_up"
            ? " — follow-up"
            : item.temporal?.actionability === "expired"
              ? " — expired (do not recommend)"
              : "";
      const typeTag = item.type ? ` {${item.type}}` : "";
      sections.push(
        `- [${when}] ${item.title}${typeTag}${who ? ` (${who})` : ""}${life}${action}`
      );
    }
    sections.push("");
  };

  render("CURRENT", partitioned.current);
  render("UPCOMING", partitioned.upcoming);
  render("OVERDUE", partitioned.overdue);
  render("COMPLETED / FOLLOW-UP", partitioned.completed);
  render("HISTORICAL", partitioned.historical);
  render(
    "EXPIRED (context only — never recommend as current action)",
    partitioned.expired
  );

  if (sections.length <= 4) {
    return items
      .map((item) => {
        const who = [item.child_name, item.space_name]
          .filter(Boolean)
          .join(" · ");
        const when = item.effective_date ?? "date TBD";
        const action = item.requires_action ? " — needs action" : "";
        return `- [${when}] ${item.title}${who ? ` (${who})` : ""}${action}`;
      })
      .join("\n");
  }

  return sections.join("\n").trim();
}
