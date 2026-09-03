import "server-only";

import {
  formatTimesheetHoursAnswer,
  formatTimesheetPeriodAnswer,
} from "./format";
import {
  parseTimesheetRemoteQuery,
  parseTimesheetHoursQuery,
  wantsTimesheetHoursQuery,
} from "./parse";
import { fetchEmployeeHours, fetchPeriodSummary } from "./query";
import { isTimesheetRemoteConfigured } from "./client";

export {
  isTimesheetRemoteConfigured,
  wantsTimesheetHoursQuery,
  parseTimesheetHoursQuery,
  parseTimesheetRemoteQuery,
};

export async function answerTimesheetHoursQuestion(
  question: string
): Promise<{ message: string } | null> {
  if (!isTimesheetRemoteConfigured()) return null;

  const parsed = parseTimesheetRemoteQuery(question);
  if (!parsed) {
    if (!wantsTimesheetHoursQuery(question)) return null;
    return {
      message:
        'Ask with a name and month, or a pay period — for example: "How many hours did Frank Damico work in May 2026?" or "Timesheet summary June 21 through July 4 2026".',
    };
  }

  if (parsed.kind === "period_summary") {
    const fetched = await fetchPeriodSummary(parsed);
    if (!fetched.ok) return { message: fetched.error };
    return { message: formatTimesheetPeriodAnswer(fetched.result) };
  }

  const fetched = await fetchEmployeeHours(parsed);
  if (!fetched.ok) return { message: fetched.error };
  return { message: formatTimesheetHoursAnswer(fetched.result) };
}
