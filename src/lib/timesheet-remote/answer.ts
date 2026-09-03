import "server-only";

import { formatTimesheetHoursAnswer } from "./format";
import {
  parseTimesheetHoursQuery,
  wantsTimesheetHoursQuery,
} from "./parse";
import { fetchEmployeeHours } from "./query";
import { isTimesheetRemoteConfigured } from "./client";

export {
  isTimesheetRemoteConfigured,
  wantsTimesheetHoursQuery,
  parseTimesheetHoursQuery,
};

export async function answerTimesheetHoursQuestion(
  question: string
): Promise<{ message: string } | null> {
  if (!isTimesheetRemoteConfigured()) return null;
  if (!wantsTimesheetHoursQuery(question)) return null;

  const parsed = parseTimesheetHoursQuery(question);
  if (!parsed) {
    return {
      message:
        'Ask with a name and month, for example: "How many hours did Frank Damico work in May 2026?"',
    };
  }

  const fetched = await fetchEmployeeHours(parsed);
  if (!fetched.ok) {
    return { message: fetched.error };
  }

  return { message: formatTimesheetHoursAnswer(fetched.result) };
}
