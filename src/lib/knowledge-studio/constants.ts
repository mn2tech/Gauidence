/** CrossRoads Connect pilot constants — reusable pattern for other orgs later. */

export const CROSSROADS_ORG_SLUG = "crossroadsconnect";

export const CROSSROADS_WEBSITE_SOURCE_LABEL = "CrossRoads Connect website";

/** Attendee-facing timezone for CrossRoads event times. */
export const CROSSROADS_TIME_ZONE = "America/New_York";

export const CROSSROADS_ALLOWED_HOSTS = new Set([
  "crossroadsconnect.us",
  "www.crossroadsconnect.us",
]);

/** Fixed seed URLs for the first website scan (not an open crawler). */
export const CROSSROADS_SCAN_URLS = [
  "https://www.crossroadsconnect.us/",
  "https://www.crossroadsconnect.us/events",
] as const;

export const WEBSITE_FETCH_TIMEOUT_MS = 15_000;
export const WEBSITE_MAX_RESPONSE_BYTES = 1_500_000;
export const WEBSITE_MAX_TEXT_CHARS = 24_000;
export const WEBSITE_MAX_TEXT_PER_PAGE = 14_000;
