/** Tunable relevance scoring for MCPS parent "What Matters". */

export const RELEVANCE_WEIGHTS = {
  // Time
  eventToday: 100,
  eventTomorrow: 90,
  within7Days: 70,
  within14Days: 50,
  within30Days: 20,

  // School / grade
  exactSchoolMatch: 60,
  districtWide: 30,
  exactGradeMatch: 30,

  // Importance
  schoolClosure: 80,
  noSchoolDay: 70,
  earlyRelease: 60,
  deadline: 60,
  transportationAlert: 60,
  parentActionRequired: 60,
  schoolEvent: 40,

  // Freshness / evergreen
  recentlyRefreshed: 10,
  /** Penalty for undated generic pages so they don't crowd the dashboard. */
  evergreenPenalty: -50,
} as const;

export type RelevanceWeightKey = keyof typeof RELEVANCE_WEIGHTS;

/** Max cards on the parent dashboard. */
export const PARENT_DASHBOARD_MAX_ITEMS = 5;

/** Prefer not to show more than this even in Coming Up. */
export const PARENT_COMING_UP_MAX_ITEMS = 8;

/** Time-sensitive items older than this many days since last check should be flagged. */
export const TIME_SENSITIVE_STALE_DAYS = 14;

export const MCPS_PARENT_PATH = "/parent";

export const GRADE_OPTIONS = [
  "Pre-K",
  "K",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
] as const;
