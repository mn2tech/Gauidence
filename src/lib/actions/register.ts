import { registerAction, getAction } from "./registry";
import { registerCoreActions } from "./actions/core";
import { payrollClockAction } from "./actions/payrollClock";
import { timesheetRemoteAction } from "./actions/timesheetRemote";
import { leadsAction } from "./actions/leads";
import { recruitAction } from "./actions/recruit";
import {
  uploadDocumentAction,
  saveDocumentAction,
} from "./actions/uploadDocument";
import { registerWorkspaceActions } from "./actions/workspace";
import { registerWorkMemoryActions } from "./actions/workMemory";
import { registerClientRequestActions } from "./actions/clientRequest";
import { registerDailyLogActions } from "./actions/dailyLog";
import { registerSpaceCreateActions } from "./actions/spaceCreate";

let allRegistered = false;

/** Register core + server actions (idempotent). */
export function registerAllActions(): void {
  if (allRegistered) return;
  registerCoreActions();
  registerWorkspaceActions();
  registerWorkMemoryActions();
  registerClientRequestActions();
  registerDailyLogActions();
  registerSpaceCreateActions();
  // Before payroll so remote timesheet hours questions win when configured.
  if (!getAction("timesheet_remote")) registerAction(timesheetRemoteAction);
  if (!getAction("payroll_clock")) registerAction(payrollClockAction);
  if (!getAction("leads")) registerAction(leadsAction);
  if (!getAction("recruit")) registerAction(recruitAction);
  if (!getAction("upload_document")) registerAction(uploadDocumentAction);
  if (!getAction("save_document")) registerAction(saveDocumentAction);
  allRegistered = true;
}
