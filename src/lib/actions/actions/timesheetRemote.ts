import "server-only";

import {
  answerTimesheetHoursQuestion,
  isTimesheetRemoteConfigured,
  parseTimesheetRemoteQuery,
} from "@/lib/timesheet-remote/answer";
import type { ActionContext, ActionDefinition } from "../types";

export const timesheetRemoteAction: ActionDefinition = {
  id: "timesheet_remote",
  label: "Timesheet Hours",
  description:
    "Answer English questions about hours from the remote timesheet Supabase project.",
  matches: (question) => {
    if (!isTimesheetRemoteConfigured()) return false;
    return parseTimesheetRemoteQuery(question) != null;
  },
  requiresConfirmation: false,
  thinkingSteps: [
    "Understanding timesheet question",
    "Looking up employee hours",
    "Formatting answer",
  ],
  executeDirect: async (ctx: ActionContext) => {
    const result = await answerTimesheetHoursQuestion(ctx.question);
    if (!result) return null;
    return { message: result.message, intent: "timesheet_hours" };
  },
};
