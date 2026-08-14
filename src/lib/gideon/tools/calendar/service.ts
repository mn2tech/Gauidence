/**
 * Calendar Service — Gideon → Tool Router → Calendar Service → Provider.
 * Google Calendar and Microsoft Outlook plug in behind this facade.
 */

import { unconnectedCalendarProvider } from "./providers/unconnected";
import type {
  CalendarAvailabilityResult,
  CalendarProvider,
  CalendarRange,
  CalendarReadResult,
  CalendarWriteInput,
  CalendarWriteResult,
} from "./types";

let activeProvider: CalendarProvider = unconnectedCalendarProvider;

/** Test / future OAuth wiring. Production Phase 1 stays unconnected. */
export function setCalendarProvider(provider: CalendarProvider): void {
  activeProvider = provider;
}

export function getCalendarProvider(): CalendarProvider {
  return activeProvider;
}

export function resetCalendarProvider(): void {
  activeProvider = unconnectedCalendarProvider;
}

export async function getCalendarEvents(
  range: CalendarRange
): Promise<CalendarReadResult> {
  const provider = getCalendarProvider();
  if (!(await provider.isConnected())) {
    return { ok: false, connected: false, reason: "not_connected", events: [] };
  }
  const events = await provider.getEvents(range);
  return { ok: true, connected: true, events };
}

export async function findAvailableTime(args: {
  durationMinutes: number;
  range: CalendarRange;
}): Promise<CalendarAvailabilityResult> {
  const provider = getCalendarProvider();
  if (!(await provider.isConnected())) {
    return { ok: false, connected: false, reason: "not_connected", slots: [] };
  }
  const slots = await provider.findAvailableTime(args);
  return { ok: true, connected: true, slots };
}

export async function createCalendarEvent(args: {
  input: CalendarWriteInput;
  confirmed?: boolean;
}): Promise<CalendarWriteResult> {
  if (!args.confirmed) {
    return { ok: false, reason: "confirmation_required" };
  }
  const provider = getCalendarProvider();
  if (!(await provider.isConnected())) {
    return { ok: false, reason: "not_connected" };
  }
  const event = await provider.createEvent(args.input);
  return { ok: true, event };
}

export async function updateCalendarEvent(args: {
  id: string;
  input: Partial<CalendarWriteInput>;
  confirmed?: boolean;
}): Promise<CalendarWriteResult> {
  if (!args.confirmed) {
    return { ok: false, reason: "confirmation_required" };
  }
  const provider = getCalendarProvider();
  if (!(await provider.isConnected())) {
    return { ok: false, reason: "not_connected" };
  }
  const event = await provider.updateEvent(args.id, args.input);
  return { ok: true, event };
}

export function formatCalendarToolNote(result: CalendarReadResult): string {
  if (!result.connected) {
    return `--- CALENDAR ---
No external calendar is connected (Google Calendar and Outlook come later).
You cannot see meetings from Google or Outlook yet. Do not invent meetings.
If UPCOMING SCHEDULE lists Guardian reminders, you may mention those as reminders — not as calendar meetings.
Never claim you created or blocked time on a calendar.
--- END CALENDAR ---`;
  }
  if (result.events.length === 0) {
    return `--- CALENDAR ---
Connected calendar has no events in the requested range.
--- END CALENDAR ---`;
  }
  const lines = result.events.map((event) => {
    const loc = event.location ? ` @ ${event.location}` : "";
    return `- ${event.start}–${event.end}: ${event.title}${loc}`;
  });
  return `--- CALENDAR ---
${lines.join("\n")}
--- END CALENDAR ---`;
}
