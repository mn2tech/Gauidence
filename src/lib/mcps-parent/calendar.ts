/** Generate calendar payloads for dated parent knowledge items (MVP). */

export type CalendarEventInput = {
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null;
  allDay?: boolean;
  description?: string;
  location?: string;
  sourceUrl?: string | null;
  schoolName?: string | null;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymdToIcsDate(ymd: string): string {
  return ymd.replace(/-/g, "");
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildIcs(event: CalendarEventInput): string {
  const uid = `${ymdToIcsDate(event.startDate)}-${Math.random()
    .toString(36)
    .slice(2, 10)}@guardian`;
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const start = ymdToIcsDate(event.startDate);
  const endYmd = event.endDate || event.startDate;
  // All-day DTEND is exclusive next day in ICS.
  const endDate = new Date(endYmd + "T12:00:00");
  endDate.setDate(endDate.getDate() + 1);
  const end = `${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(
    endDate.getDate()
  )}`;

  const descParts = [
    event.description?.trim() || "",
    event.schoolName ? `School: ${event.schoolName}` : "",
    event.sourceUrl ? `Source: ${event.sourceUrl}` : "",
    "Via Guardian — verify with MCPS for official decisions.",
  ].filter(Boolean);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Guardian//MCPS Parent//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(descParts.join("\n"))}`,
    event.location
      ? `LOCATION:${escapeIcsText(event.location)}`
      : null,
    event.sourceUrl ? `URL:${event.sourceUrl}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.join("\r\n") + "\r\n";
}

/** Google Calendar template URL for an all-day event. */
export function buildGoogleCalendarUrl(event: CalendarEventInput): string {
  const start = ymdToIcsDate(event.startDate);
  const endYmd = event.endDate || event.startDate;
  const endDate = new Date(endYmd + "T12:00:00");
  endDate.setDate(endDate.getDate() + 1);
  const end = `${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(
    endDate.getDate()
  )}`;
  const details = [
    event.description?.trim() || "",
    event.schoolName ? `School: ${event.schoolName}` : "",
    event.sourceUrl ? `Source: ${event.sourceUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
    details,
  });
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
