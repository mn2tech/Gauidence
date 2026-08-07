import {
  DAILY_LOG_CAPTURE_SYSTEM_NOTE,
  wantsDailyLogCapture,
} from "@/lib/logs/propose";
import { registerAction, getAction } from "../registry";
import type { ActionDefinition } from "../types";

export const captureDailyLogAction: ActionDefinition = {
  id: "capture_daily_log",
  label: "Capture Daily Log",
  description:
    "Propose saving a Daily Log note from conversation for user confirmation.",
  matches: (question, ctx) => wantsDailyLogCapture(question, ctx.chatHistory ?? []),
  systemNote: () => DAILY_LOG_CAPTURE_SYSTEM_NOTE,
  requiresConfirmation: true,
  thinkingSteps: [
    "Understanding request",
    "Drafting vault note",
    "Preparing Daily Log proposal",
  ],
};

let registered = false;

export function registerDailyLogActions(): void {
  if (registered) return;
  if (!getAction("capture_daily_log")) registerAction(captureDailyLogAction);
  registered = true;
}
