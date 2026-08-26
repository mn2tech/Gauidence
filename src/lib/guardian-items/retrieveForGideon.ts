import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarDateInUserZone } from "@/lib/timezone";
import { addCalendarDays, effectiveCalendarDate } from "./dates";
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
};

const SCHEDULE_INTENT =
  /\b(schedule|calendar|remind(?:er)?s?|upcoming|attention|deadline|due|what(?:'s| is) (?:on|coming)|this week|next week|tomorrow|today|what do i need|needs? (?:my )?attention|closed|closure)\b/i;

export function wantsGuardianItemRetrieval(question: string): boolean {
  return SCHEDULE_INTENT.test(question.trim());
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
  }
): Promise<GideonGuardianItem[]> {
  const limit = args.limit ?? 16;
  const horizonDays = args.horizonDays ?? 120;
  const scopeIds = [...new Set(args.spaceIds)].filter(Boolean);
  if (scopeIds.length === 0) return [];

  const today = calendarDateInUserZone(new Date(), args.timeZone);
  const horizonEnd = addCalendarDays(today, horizonDays);

  const { data, error } = await supabase
    .from("guardian_items")
    .select(
      "id, space_id, child_id, type, title, event_date, due_at, requires_action, priority, source_excerpt, status"
    )
    .in("space_id", scopeIds)
    .eq("status", "active")
    .limit(80);

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

  const childFilter = args.childNameFilter?.trim().toLowerCase();

  const items: GideonGuardianItem[] = [];
  for (const row of data as GuardianItemRow[]) {
    const effective = effectiveCalendarDate({
      eventDate: row.event_date,
      dueAt: row.due_at,
      timeZone: args.timeZone,
      calendarDateInZone: calendarDateInUserZone,
    });
    if (effective && effective > horizonEnd) continue;

    const childName = row.child_id ? nameMap[row.child_id] ?? null : null;
    if (childFilter && childName) {
      const cn = childName.toLowerCase();
      if (!cn.includes(childFilter) && !childFilter.includes(cn.split(/\s+/)[0]!)) {
        continue;
      }
    } else if (childFilter && !childName) {
      continue;
    }

    items.push({
      id: row.id,
      space_id: row.space_id,
      child_id: row.child_id,
      type: row.type,
      title: row.title,
      effective_date: effective,
      requires_action: row.requires_action,
      priority: row.priority,
      space_name: nameMap[row.space_id] ?? null,
      child_name: childName,
      source_excerpt: row.source_excerpt,
    });
  }

  items.sort(
    (a, b) =>
      scoreGuardianItemRelevance(b, args.question) -
      scoreGuardianItemRelevance(a, args.question)
  );

  return items.slice(0, limit);
}

export function formatGuardianItemsForGideon(
  items: GideonGuardianItem[]
): string {
  if (items.length === 0) return "(none)";
  return items
    .map((item) => {
      const who = [item.child_name, item.space_name].filter(Boolean).join(" · ");
      const when = item.effective_date ?? "date TBD";
      const action = item.requires_action ? " — needs action" : "";
      return `- [${when}] ${item.title}${who ? ` (${who})` : ""}${action}`;
    })
    .join("\n");
}
