export {
  classifySchoolNewsletter,
  type NewsletterClassification,
} from "./classify";
export {
  extractPublicationDate,
  parseLooseNewsletterDate,
  resolveHomeworkWeekStart,
  dateForWeekdayInWeek,
  mondayOfWeek,
  parseEventTimesOnDate,
  formatTimeRangeLabel,
} from "./dates";
export {
  extractSchoolNewsletterItems,
  type NewsletterExtractionResult,
  type NewsletterExtractionMeta,
} from "./extract";
export {
  buildNewsletterReviewSummary,
  formatReviewCountLines,
  type NewsletterReviewSummary,
  type NewsletterReviewCounts,
} from "./review";
export {
  formatSchoolDayAnswer,
  wantsSchoolStructuredAnswer,
  wantsSpellingList,
  wantsSchoolHistory,
  shouldSurfaceSchoolItemInToday,
  type SchoolAnswerItem,
} from "./answer";
