/** Pure helpers for multi-child parent school contexts (unit-testable). */

import { MAX_PARENT_SCHOOL_CONTEXTS } from "./constants";
import type { ParentSchoolContext, ScoredParentItem } from "./types";

export function displayContextLabel(ctx: {
  label?: string | null;
  school_name: string;
  grade_level: string;
}): string {
  const label = ctx.label?.trim();
  if (label) return label;
  return `${ctx.school_name} — Grade ${ctx.grade_level}`;
}

export function displayContextSwitcherOption(ctx: {
  label?: string | null;
  school_name: string;
  grade_level: string;
}): string {
  const label = ctx.label?.trim();
  if (label) return `${label} — ${ctx.school_name}`;
  return `${ctx.school_name} — Grade ${ctx.grade_level}`;
}

export function canAddParentContext(currentCount: number, max = MAX_PARENT_SCHOOL_CONTEXTS): boolean {
  return currentCount < max;
}

export function validateContextInput(args: {
  schoolName: string;
  gradeLevel: string;
  label?: string | null;
}): { school_name: string; grade_level: string; label: string | null } {
  const school_name = args.schoolName.trim().slice(0, 200);
  const grade_level = args.gradeLevel.trim().slice(0, 40);
  const labelRaw = typeof args.label === "string" ? args.label.trim().slice(0, 80) : "";
  if (!school_name) throw new Error("School is required.");
  if (!grade_level) throw new Error("Grade is required.");
  return {
    school_name,
    grade_level,
    label: labelRaw || null,
  };
}

/**
 * Same school + grade is a duplicate unless labels differ (two kids, same grade).
 */
export function isDuplicateSchoolGrade(args: {
  existing: Array<{ id?: string; school_name: string; grade_level: string; label?: string | null }>;
  schoolName: string;
  gradeLevel: string;
  label?: string | null;
  excludeId?: string;
}): boolean {
  const school = args.schoolName.trim().toLowerCase();
  const grade = args.gradeLevel.trim().toLowerCase();
  const label = (args.label?.trim() || "").toLowerCase();
  return args.existing.some((row) => {
    if (args.excludeId && row.id === args.excludeId) return false;
    if (row.school_name.trim().toLowerCase() !== school) return false;
    if (row.grade_level.trim().toLowerCase() !== grade) return false;
    const otherLabel = (row.label?.trim() || "").toLowerCase();
    // Both unlabeled, or same label → duplicate.
    return otherLabel === label;
  });
}

export function pickPrimaryAfterDelete(
  remaining: ParentSchoolContext[],
  deletedWasPrimary: boolean
): string | null {
  if (!remaining.length) return null;
  if (!deletedWasPrimary) {
    const primary = remaining.find((r) => r.is_primary);
    return primary?.id ?? remaining[0]!.id;
  }
  return remaining[0]!.id;
}

export function dedupeKeyForItem(item: {
  id: string;
  title: string;
  event_date?: string | null;
  source_name?: string;
  source_url?: string | null;
}): string {
  return item.id;
}

export function softDedupeKey(item: {
  title: string;
  event_date?: string | null;
  source_name?: string;
  source_url?: string | null;
}): string {
  const title = item.title.trim().toLowerCase().replace(/\s+/g, " ");
  const date = item.event_date ?? "";
  const source = (item.source_url || item.source_name || "").toLowerCase();
  return `${source}|${title}|${date}`;
}

export function formatAppliesTo(args: {
  districtWide: boolean;
  labels: string[];
  totalContexts: number;
}): string {
  if (args.districtWide || args.labels.length >= args.totalContexts) {
    return args.districtWide ? "All MCPS schools" : "All your schools";
  }
  if (args.labels.length === 1) return args.labels[0]!;
  if (args.labels.length === 2) return `${args.labels[0]} + ${args.labels[1]}`;
  return args.labels.join(", ");
}

/**
 * Merge per-context ranked lists: dedupe by knowledge id (then soft key),
 * keep max score, union applying contexts.
 */
export function mergeFamilyItems(args: {
  perContext: Array<{
    context: Pick<ParentSchoolContext, "id" | "label" | "school_name" | "grade_level">;
    items: ScoredParentItem[];
  }>;
  limit: number;
}): ScoredParentItem[] {
  const total = args.perContext.length;
  type Acc = {
    item: ScoredParentItem;
    contextIds: Set<string>;
    softKey: string;
  };
  const byId = new Map<string, Acc>();
  const softToId = new Map<string, string>();

  for (const { context, items } of args.perContext) {
    for (const item of items) {
      const districtWide = !item.school?.trim();
      const soft = softDedupeKey(item);
      let existing = byId.get(item.id);
      if (!existing) {
        const softHit = softToId.get(soft);
        if (softHit) existing = byId.get(softHit);
      }
      if (existing) {
        existing.contextIds.add(context.id);
        if (item.score > existing.item.score) {
          existing.item = { ...item, score: item.score };
        } else {
          existing.item = {
            ...existing.item,
            score: Math.max(existing.item.score, item.score),
          };
        }
        if (districtWide) existing.item.district_wide = true;
        continue;
      }
      const contextIds = new Set([context.id]);
      byId.set(item.id, {
        item: { ...item, district_wide: districtWide },
        contextIds,
        softKey: soft,
      });
      softToId.set(soft, item.id);
    }
  }

  const labelById = new Map(
    args.perContext.map(({ context }) => [
      context.id,
      displayContextLabel(context),
    ])
  );

  const merged: ScoredParentItem[] = [];
  for (const acc of byId.values()) {
    const ids = [...acc.contextIds];
    const labels = ids.map((id) => labelById.get(id) ?? id);
    const districtWide = Boolean(acc.item.district_wide) || !acc.item.school?.trim();
    // Multi-context boost when the same event hits several kids (non-district).
    let score = acc.item.score;
    if (!districtWide && ids.length > 1) {
      score += 10 * (ids.length - 1);
    }
    merged.push({
      ...acc.item,
      score,
      applies_to_context_ids: ids,
      district_wide: districtWide,
      applies_to_labels: labels,
    });
  }

  merged.sort(
    (a, b) =>
      b.score - a.score ||
      (a.event_date ?? "").localeCompare(b.event_date ?? "")
  );

  // Title dedupe after merge (near-identical display titles).
  const seenTitles = new Set<string>();
  const out: ScoredParentItem[] = [];
  for (const row of merged) {
    const key = row.title.trim().toLowerCase();
    if (seenTitles.has(key) && row.district_wide) continue;
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    out.push(row);
    if (out.length >= args.limit) break;
  }
  return out;
}

export function resolveQuestionContexts(args: {
  question: string;
  contexts: ParentSchoolContext[];
  activeView: "all" | string;
  primaryId: string | null;
}): {
  mode: "all" | "single";
  contexts: ParentSchoolContext[];
  reason: "explicit_school" | "explicit_label" | "family_intent" | "active_view" | "primary";
} {
  const q = args.question.toLowerCase();
  const familyIntent =
    /\b(my family|all (?:my )?kids|any of my (?:kids|children)|for us\b|our family)\b/i.test(
      args.question
    );

  // Friendly label hit (whole word-ish).
  for (const ctx of args.contexts) {
    const label = ctx.label?.trim();
    if (!label || label.length < 2) continue;
    const re = new RegExp(`\\b${escapeRegExp(label)}\\b`, "i");
    if (re.test(args.question)) {
      return { mode: "single", contexts: [ctx], reason: "explicit_label" };
    }
  }

  // Explicit school name in the question.
  const schoolHits: ParentSchoolContext[] = [];
  for (const ctx of args.contexts) {
    if (schoolMentionedInQuestion(ctx.school_name, q)) {
      schoolHits.push(ctx);
    }
  }
  if (schoolHits.length === 1) {
    return {
      mode: "single",
      contexts: schoolHits,
      reason: "explicit_school",
    };
  }
  if (schoolHits.length > 1) {
    // Prefer the longest school-name match.
    schoolHits.sort(
      (a, b) => b.school_name.length - a.school_name.length
    );
    return {
      mode: "single",
      contexts: [schoolHits[0]!],
      reason: "explicit_school",
    };
  }

  if (familyIntent || args.activeView === "all") {
    return {
      mode: "all",
      contexts: args.contexts,
      reason: familyIntent ? "family_intent" : "active_view",
    };
  }

  if (args.activeView !== "all") {
    const hit = args.contexts.find((c) => c.id === args.activeView);
    if (hit) {
      return { mode: "single", contexts: [hit], reason: "active_view" };
    }
  }

  const primary =
    args.contexts.find((c) => c.id === args.primaryId) ??
    args.contexts.find((c) => c.is_primary) ??
    args.contexts[0];
  if (primary) {
    return { mode: "single", contexts: [primary], reason: "primary" };
  }
  return { mode: "all", contexts: args.contexts, reason: "family_intent" };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function schoolMentionedInQuestion(school: string, questionLower: string): boolean {
  const full = school.trim().toLowerCase();
  if (full.length >= 4 && questionLower.includes(full)) return true;
  const stem = school
    .replace(/\s+(Elementary|Middle|High)\s+School$/i, "")
    .trim();
  if (stem.length >= 4 && questionLower.includes(stem.toLowerCase())) return true;
  // "Rosa Parks" from "Rosa M. Parks"
  const noInitials = stem
    .replace(/\b[A-Za-z]\.\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (noInitials.length >= 4 && questionLower.includes(noInitials.toLowerCase())) {
    return true;
  }
  return false;
}

export function buildFamilySuggestedQuestions(args: {
  view: "all" | "single";
  topItems: ScoredParentItem[];
}): string[] {
  if (args.view === "all") {
    return [
      "What does my family need to know this week?",
      "Do any of my kids have a day off coming up?",
      "Anything I need to do this week?",
      "What important dates are coming up?",
      "Are there any early release days coming up?",
      "Is there anything I need to do?",
    ].slice(0, 6);
  }
  const base = [
    "What do I need to know this week?",
    "Is there school Friday?",
    "When is the next day off?",
    "Anything I need to do?",
    "Are there any early release days coming up?",
    "Who do I contact about transportation?",
  ];
  const dynamic: string[] = [];
  for (const item of args.topItems.slice(0, 2)) {
    if (item.importance_tags.includes("early_release")) {
      dynamic.push("When is the next early release?");
    }
  }
  return [...new Set([...dynamic, ...base])].slice(0, 6);
}
