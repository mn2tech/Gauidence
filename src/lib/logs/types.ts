import type { GuardianProfileType } from "@/lib/profiles/types";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";

export type DailyLog = {
  id: string;
  owner_user_id: string;
  profile_id: string;
  log_date: string;
  title: string | null;
  content: string;
  category: string | null;
  tags: string[];
  source_type: "user_entered" | "quick_log";
  created_at: string;
  updated_at: string;
};

export const LOG_CATEGORIES_BY_PROFILE: Record<
  GuardianProfileType,
  string[]
> = {
  personal: [
    "General",
    "Family",
    "Finance",
    "Home",
    "Travel",
    "Important Event",
  ],
  child: [
    "School",
    "Homework",
    "Achievement",
    "Activity",
    "Teacher Update",
    "Important Event",
  ],
  student: [
    "School",
    "Homework",
    "Achievement",
    "Activity",
    "Teacher Update",
    "Important Event",
  ],
  spouse_partner: [
    "General",
    "Family",
    "Finance",
    "Home",
    "Travel",
    "Important Event",
  ],
  parent: [
    "General",
    "Family",
    "Finance",
    "Home",
    "Travel",
    "Important Event",
  ],
  family_member: [
    "General",
    "Family",
    "Finance",
    "Home",
    "Travel",
    "Important Event",
  ],
  business: [
    "Client",
    "Invoice",
    "Contract",
    "Project",
    "Meeting",
    "Sales",
    "Operations",
    "Important Event",
  ],
  non_profit: [
    "Donor",
    "Grant",
    "Program",
    "Volunteer",
    "Board",
    "Fundraising",
    "Meeting",
    "Operations",
    "Important Event",
  ],
  employee: [
    "Work Update",
    "Project",
    "Task",
    "Achievement",
    "Issue",
    "Training",
  ],
  client: [
    "Client",
    "Project",
    "Meeting",
    "Invoice",
    "Important Event",
    "General",
  ],
  other: ["General", "Important Event"],
};

export function categoriesForProfileType(
  type: GuardianProfileType
): string[] {
  return LOG_CATEGORIES_BY_PROFILE[type] ?? ["General"];
}

/** Today's calendar date in Guardian's product timezone (YYYY-MM-DD). */
export function todayLogDate(timeZone = GUARDIAN_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Parse YYYY-MM-DD without timezone shift. */
export function isValidLogDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function formatLogDayHeading(
  logDate: string,
  today = todayLogDate()
): string {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${logDate}T12:00:00.000Z`));

  if (logDate === today) return `Today — ${label}`;
  const y = new Date(`${today}T12:00:00.000Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  if (logDate === yesterday) return `Yesterday — ${label}`;
  return label;
}

/** Score a log against a query for Gideon retrieval (higher = better). */
export function scoreLogRelevance(
  log: Pick<DailyLog, "content" | "title" | "category" | "tags" | "log_date">,
  question: string,
  today = todayLogDate()
): number {
  const q = question.toLowerCase();
  const tokens = q
    .split(/[^a-z0-9#]+/i)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return 0;

  const hay = [
    log.content,
    log.title ?? "",
    log.category ?? "",
    ...(log.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 2;
  }
  if (/today|yesterday|recent|this week|follow.?up|happened/i.test(q)) {
    const age =
      (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${log.log_date}T12:00:00Z`)) /
      86400000;
    if (age >= 0 && age <= 14) score += Math.max(0, 3 - age * 0.15);
  }
  return score;
}
