/** Public exports safe for unit tests (no server-only). */

export {
  PARENT_DASHBOARD_MAX_ITEMS,
  PARENT_COMING_UP_MAX_ITEMS,
  RELEVANCE_WEIGHTS,
  GRADE_OPTIONS,
  MCPS_PARENT_PATH,
} from "./constants";
export {
  addDays,
  daysBetween,
  detectImportanceTags,
  extractEventDate,
  gradesMatch,
  greetingForNow,
  isExpired,
  normalizeSchoolKey,
  parseYmd,
  schoolsMatch,
  toYmd,
} from "./dates";
export {
  buildSuggestedQuestions,
  groupComingUp,
  rankWhatMatters,
  scoreKnowledgeItem,
} from "./scoring";
export type { ScoreableKnowledge, ScoreContext } from "./scoring";
export { buildGoogleCalendarUrl, buildIcs } from "./calendar";
export type * from "./types";
