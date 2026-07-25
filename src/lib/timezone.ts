/** Product default timezone when the user has not set one yet. */
export const GUARDIAN_TIME_ZONE = "America/New_York";

export type TimeZoneSource = "default" | "auto" | "manual";

const KNOWN_TIMEZONE_LABELS: Record<string, string> = {
  "America/New_York": "Eastern Time",
  "America/Chicago": "Central Time",
  "America/Denver": "Mountain Time",
  "America/Los_Angeles": "Pacific Time",
  "America/Anchorage": "Alaska Time",
  "Pacific/Honolulu": "Hawaii Time",
  "Asia/Kolkata": "India Standard Time",
  "Europe/London": "UK time",
  "UTC": "UTC",
};

export function isValidIanaTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Browser/device IANA zone, or product default if unavailable. */
export function detectBrowserTimeZone(): string {
  if (typeof Intl === "undefined") return GUARDIAN_TIME_ZONE;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidIanaTimeZone(tz) ? tz : GUARDIAN_TIME_ZONE;
  } catch {
    return GUARDIAN_TIME_ZONE;
  }
}

/** Human label for prompts and UI (e.g. reminder copy). */
export function guardianTimeZoneLabel(
  timeZone: string = GUARDIAN_TIME_ZONE
): string {
  if (KNOWN_TIMEZONE_LABELS[timeZone]) {
    return KNOWN_TIMEZONE_LABELS[timeZone]!;
  }
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longGeneric",
    }).formatToParts(new Date());
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    if (name) return name;
  } catch {
    /* fall through */
  }
  return timeZone.replace(/_/g, " ");
}

/** e.g. "Saturday, July 25, 2026" in the given IANA timezone. */
export function formatGuardianTodayLabel(
  instant: Date = new Date(),
  timeZone: string = GUARDIAN_TIME_ZONE
): string {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  }).format(instant);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(instant);
  return `${weekday}, ${date}`;
}

/** e.g. "4:50 PM" in the given IANA timezone. */
export function formatGuardianTimeLabel(
  instant: Date = new Date(),
  timeZone: string = GUARDIAN_TIME_ZONE
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

/** Calendar YYYY-MM-DD in an IANA timezone. */
export function calendarDateInUserZone(
  instant: Date = new Date(),
  timeZone: string = GUARDIAN_TIME_ZONE
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}
