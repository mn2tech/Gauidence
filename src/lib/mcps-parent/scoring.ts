import {
  PARENT_DASHBOARD_MAX_ITEMS,
  RELEVANCE_WEIGHTS,
  TIME_SENSITIVE_STALE_DAYS,
} from "./constants";
import {
  daysBetween,
  detectImportanceTags,
  extractEventDate,
  gradesMatch,
  isExpired,
  parseYmd,
  schoolsMatch,
  toYmd,
} from "./dates";
import { humanizeKnowledgeTitle, humanizeSummary, allowsOpportunisticEventDates } from "./display";
import type { RelevanceReason, ScoredParentItem } from "./types";

export type ScoreableKnowledge = {
  id: string;
  title: string;
  content: string;
  category: string;
  school: string | null;
  grade_level: string | null;
  authority: string | null;
  source_url: string | null;
  effective_date: string | null;
  expires_at: string | null;
  status: string;
  source_name?: string;
  last_checked_at?: string | null;
};

export type ScoreContext = {
  schoolName: string;
  gradeLevel: string;
  asOf: Date;
};

const ACTIONABLE_TAGS = new Set([
  "school_closure",
  "no_school",
  "early_release",
  "deadline",
  "parent_action",
  "transportation",
]);

function timeScore(
  eventDate: string | null,
  asOf: Date
): { score: number; reasons: RelevanceReason[] } {
  if (!eventDate) return { score: 0, reasons: [] };
  const d = parseYmd(eventDate);
  if (!d) return { score: 0, reasons: [] };
  const delta = daysBetween(asOf, d);
  if (delta < 0) return { score: 0, reasons: [] };
  if (delta === 0) {
    return { score: RELEVANCE_WEIGHTS.eventToday, reasons: ["Coming up this week"] };
  }
  if (delta === 1) {
    return {
      score: RELEVANCE_WEIGHTS.eventTomorrow,
      reasons: ["Coming up this week"],
    };
  }
  if (delta <= 7) {
    return {
      score: RELEVANCE_WEIGHTS.within7Days,
      reasons: ["Coming up this week"],
    };
  }
  if (delta <= 14) {
    return {
      score: RELEVANCE_WEIGHTS.within14Days,
      reasons: ["Coming up soon"],
    };
  }
  if (delta <= 30) {
    return { score: RELEVANCE_WEIGHTS.within30Days, reasons: ["Coming up soon"] };
  }
  return { score: 0, reasons: [] };
}

function importanceScore(tags: string[]): {
  score: number;
  reasons: RelevanceReason[];
} {
  let score = 0;
  const reasons: RelevanceReason[] = [];
  if (tags.includes("school_closure")) {
    score += RELEVANCE_WEIGHTS.schoolClosure;
    reasons.push("No school / closure");
  }
  if (tags.includes("no_school")) {
    score += RELEVANCE_WEIGHTS.noSchoolDay;
    if (!reasons.includes("No school / closure")) reasons.push("No school / closure");
  }
  if (tags.includes("early_release")) {
    score += RELEVANCE_WEIGHTS.earlyRelease;
    reasons.push("Early release");
  }
  if (tags.includes("deadline")) {
    score += RELEVANCE_WEIGHTS.deadline;
    reasons.push("Deadline");
  }
  if (tags.includes("transportation")) {
    score += RELEVANCE_WEIGHTS.transportationAlert;
    reasons.push("Transportation");
  }
  if (tags.includes("parent_action")) {
    score += RELEVANCE_WEIGHTS.parentActionRequired;
    reasons.push("Parent action required");
  }
  if (tags.includes("school_event")) {
    score += RELEVANCE_WEIGHTS.schoolEvent;
  }
  return { score, reasons };
}

function schoolGradeScore(args: {
  itemSchool: string | null;
  itemGrade: string | null;
  selectedSchool: string;
  selectedGrade: string;
}): { score: number; reasons: RelevanceReason[]; exclude: boolean } {
  const hasSchool = Boolean(args.itemSchool?.trim());
  if (hasSchool && !schoolsMatch(args.selectedSchool, args.itemSchool)) {
    return { score: 0, reasons: [], exclude: true };
  }

  let score = 0;
  const reasons: RelevanceReason[] = [];
  if (hasSchool && schoolsMatch(args.selectedSchool, args.itemSchool)) {
    score += RELEVANCE_WEIGHTS.exactSchoolMatch;
    reasons.push("Applies to your school");
  } else if (!hasSchool) {
    score += RELEVANCE_WEIGHTS.districtWide;
    reasons.push("District-wide");
  }

  if (gradesMatch(args.selectedGrade, args.itemGrade)) {
    score += RELEVANCE_WEIGHTS.exactGradeMatch;
    reasons.push("Applies to your grade");
  }

  return { score, reasons, exclude: false };
}

function freshnessScore(
  lastCheckedAt: string | null | undefined,
  asOf: Date,
  timeSensitive: boolean
): { score: number; stale: boolean } {
  if (!lastCheckedAt) {
    return { score: 0, stale: timeSensitive };
  }
  const checked = new Date(lastCheckedAt);
  if (Number.isNaN(checked.getTime())) {
    return { score: 0, stale: timeSensitive };
  }
  const ageDays = daysBetween(checked, asOf);
  if (ageDays <= 7) {
    return { score: RELEVANCE_WEIGHTS.recentlyRefreshed, stale: false };
  }
  if (timeSensitive && ageDays > TIME_SENSITIVE_STALE_DAYS) {
    return { score: 0, stale: true };
  }
  return { score: 0, stale: false };
}

/** Dashboard cards require a near-term event date. No evergreen filler. */
export function isDashboardWorthy(item: ScoredParentItem, asOf: Date): boolean {
  if (!item.event_date) return false;
  const d = parseYmd(item.event_date);
  if (!d) return false;
  const delta = daysBetween(asOf, d);
  return delta >= 0 && delta <= 30;
}

function isEvergreen(args: {
  eventDate: string | null;
  tags: string[];
  asOf: Date;
}): boolean {
  if (args.tags.some((t) => ACTIONABLE_TAGS.has(t))) return false;
  if (!args.eventDate) return true;
  const d = parseYmd(args.eventDate);
  if (!d) return true;
  const delta = daysBetween(args.asOf, d);
  return delta < 0 || delta > 30;
}

export function scoreKnowledgeItem(
  item: ScoreableKnowledge,
  ctx: ScoreContext
): ScoredParentItem | null {
  if (item.status !== "published") return null;
  if (isExpired(item.expires_at, ctx.asOf)) return null;

  const blob = `${item.title}\n${item.content}`;
  const tags = detectImportanceTags(blob);

  // Avoid false dates on evergreen parent-resources / schools / transportation pages.
  let eventDate: string | null = null;
  if (allowsOpportunisticEventDates(item.category, tags)) {
    eventDate = extractEventDate({
      title: item.title,
      content: item.content,
      effectiveDate: item.effective_date,
      asOf: ctx.asOf,
    });
  } else if (item.effective_date && item.category.trim().toLowerCase() === "calendar") {
    // Only calendar items may use bare effective_date without content mining.
    const e = parseYmd(item.effective_date);
    if (e && daysBetween(ctx.asOf, e) >= 0) {
      eventDate = toYmd(e);
    }
  }

  // Past dated events should not surface.
  if (eventDate) {
    const d = parseYmd(eventDate);
    if (d && daysBetween(ctx.asOf, d) < 0) return null;
  }

  const sg = schoolGradeScore({
    itemSchool: item.school,
    itemGrade: item.grade_level,
    selectedSchool: ctx.schoolName,
    selectedGrade: ctx.gradeLevel,
  });
  if (sg.exclude) return null;

  const time = timeScore(eventDate, ctx.asOf);
  const importance = importanceScore(tags);
  const timeSensitive =
    tags.some((t) =>
      ["school_closure", "no_school", "early_release", "transportation"].includes(
        t
      )
    ) || Boolean(eventDate && time.score > 0);
  const fresh = freshnessScore(item.last_checked_at, ctx.asOf, timeSensitive);
  const evergreen = isEvergreen({ eventDate, tags, asOf: ctx.asOf });

  let score =
    time.score + sg.score + importance.score + fresh.score;
  if (evergreen) {
    score += RELEVANCE_WEIGHTS.evergreenPenalty;
  }

  // Drop low-signal evergreen noise from ranking entirely.
  if (evergreen && importance.score === 0 && time.score === 0) {
    return null;
  }
  if (score < 25) return null;

  const reasons = [
    ...new Set([...sg.reasons, ...time.reasons, ...importance.reasons]),
  ];

  const displayTitle = humanizeKnowledgeTitle({
    title: item.title,
    content: item.content,
    category: item.category,
    tags,
  });

  // Only attach event_date when it contributes near-term relevance.
  const displayEventDate = time.score > 0 ? eventDate : null;

  return {
    id: item.id,
    title: displayTitle,
    summary: humanizeSummary(item.content, {
      title: displayTitle,
      tags,
    }),
    category: item.category,
    school: item.school,
    grade_level: item.grade_level,
    authority: item.authority,
    source_url: item.source_url,
    source_name: item.source_name ?? item.authority ?? "MCPS",
    event_date: displayEventDate,
    effective_date: item.effective_date,
    expires_at: item.expires_at,
    last_checked_at: item.last_checked_at ?? null,
    score,
    reasons,
    importance_tags: tags,
    stale: fresh.stale,
  };
}

export function rankWhatMatters(
  items: ScoreableKnowledge[],
  ctx: ScoreContext,
  limit = PARENT_DASHBOARD_MAX_ITEMS
): ScoredParentItem[] {
  const scored: ScoredParentItem[] = [];
  for (const item of items) {
    const s = scoreKnowledgeItem(item, ctx);
    if (s) scored.push(s);
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.event_date ?? "").localeCompare(b.event_date ?? "")
  );

  // Prefer actionable / dated cards for the parent dashboard.
  const worthy = scored.filter((s) => isDashboardWorthy(s, ctx.asOf));

  // Dedupe near-identical display titles (e.g. two ParentVUE extracts).
  const seenTitles = new Set<string>();
  const deduped: ScoredParentItem[] = [];
  for (const row of worthy) {
    const key = row.title.trim().toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    deduped.push(row);
  }

  // Never fall back to evergreen filler — caught-up is better than noise.
  return deduped.slice(0, limit);
}

export function groupComingUp(
  items: ScoredParentItem[],
  asOf: Date
): Array<{ label: "This Week" | "Next Week" | "Later"; items: ScoredParentItem[] }> {
  const thisWeek: ScoredParentItem[] = [];
  const nextWeek: ScoredParentItem[] = [];
  const later: ScoredParentItem[] = [];

  for (const item of items) {
    // Coming Up is for dated items only — no evergreen dump.
    if (!item.event_date) continue;
    const d = parseYmd(item.event_date);
    if (!d) continue;
    const delta = daysBetween(asOf, d);
    if (delta < 0) continue;
    if (delta <= 7) thisWeek.push(item);
    else if (delta <= 14) nextWeek.push(item);
    else if (delta <= 30) later.push(item);
  }

  return [
    { label: "This Week" as const, items: thisWeek },
    { label: "Next Week" as const, items: nextWeek },
    { label: "Later" as const, items: later },
  ].filter((g) => g.items.length > 0);
}

export function buildSuggestedQuestions(args: {
  hasSchool: boolean;
  topItems: ScoredParentItem[];
}): string[] {
  const base = [
    "What do I need to know this week?",
    "Is there school Friday?",
    "When is the next day off?",
    "Are there any early release days coming up?",
    "Is there anything I need to do?",
    "Who do I contact about transportation?",
  ];
  const dynamic: string[] = [];
  for (const item of args.topItems.slice(0, 2)) {
    if (item.importance_tags.includes("early_release")) {
      dynamic.push("When is the next early release?");
    }
    if (
      item.importance_tags.includes("no_school") ||
      item.importance_tags.includes("school_closure")
    ) {
      dynamic.push("When is the next day off?");
    }
  }
  return [...new Set([...dynamic, ...base])].slice(0, 6);
}

export { toYmd };
