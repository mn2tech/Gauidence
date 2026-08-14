import { loadFlagsForRoute, type GideonLoadFlags } from "./capabilities";
import {
  classifyGideonIntent,
  type ClassifyGideonIntentArgs,
  type GideonRoute,
} from "./intent";
import {
  formatCalendarToolNote,
  getCalendarEvents,
} from "./tools/calendar/service";

export type { GideonLoadFlags, GideonRoute };

export function routeGideonRequest(args: ClassifyGideonIntentArgs): GideonRoute {
  return classifyGideonIntent(args);
}

export function resolveGideonLoad(route: GideonRoute): GideonLoadFlags {
  return loadFlagsForRoute(route);
}

/** Start/end of the user's local calendar day (for read-only calendar peek). */
export function localDayRange(now: Date, timeZone: string): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  return { start, end };
}

export async function loadCalendarPromptNote(args: {
  route: GideonRoute;
  timeZone: string;
  now?: Date;
}): Promise<string> {
  if (!args.route.capabilities.calendar) return "";
  const range = localDayRange(args.now ?? new Date(), args.timeZone);
  const result = await getCalendarEvents(range);
  return formatCalendarToolNote(result);
}
