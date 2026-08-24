import { loadFlagsForRoute, type GideonLoadFlags } from "./capabilities";
import {
  classifyGideonIntent,
  type ClassifyGideonIntentArgs,
  type GideonRoute,
} from "./intent";
import {
  routeGideonOrchestration,
  type GideonOrchestrationRoute,
  type RouteGideonOrchestrationArgs,
} from "./request-router";
import {
  formatCalendarToolNote,
  getCalendarEvents,
} from "./tools/calendar/service";

export type { GideonLoadFlags, GideonRoute, GideonOrchestrationRoute };

export function routeGideonRequest(args: ClassifyGideonIntentArgs): GideonRoute {
  return classifyGideonIntent(args);
}

/** Knowledge-first orchestration route (intent + depth + knowledge modes). */
export function routeGideonKnowledgeRequest(
  args: RouteGideonOrchestrationArgs
): GideonOrchestrationRoute {
  return routeGideonOrchestration(args);
}

export function resolveGideonLoad(route: GideonRoute): GideonLoadFlags {
  return loadFlagsForRoute(route);
}

/**
 * Merge capability routing with knowledge orchestration.
 * Skip document search for pure conversation — but never strip knowledge
 * when intent already flagged music/songs, vault inventory, or attachments.
 */
export function resolveGideonLoadWithOrchestration(args: {
  capabilityRoute: GideonRoute;
  orchestration: GideonOrchestrationRoute;
  hasAttachment?: boolean;
}): GideonLoadFlags {
  const base = loadFlagsForRoute(args.capabilityRoute);
  const needsKnowledge =
    args.hasAttachment ||
    args.orchestration.guardianKnowledgeRequired ||
    base.documents;
  if (needsKnowledge) {
    return {
      ...base,
      documents: true,
      logs: true,
      vaultMap: true,
      clientRequests: true,
      proposals: true,
      linkedProfiles: true,
    };
  }
  return {
    ...base,
    documents: false,
    logs: false,
    clientRequests: false,
    proposals: false,
    vaultMap: false,
    linkedProfiles: false,
  };
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
