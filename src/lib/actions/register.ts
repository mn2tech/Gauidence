import { registerAction, getAction } from "./registry";
import { registerCoreActions } from "./actions/core";
import { payrollClockAction } from "./actions/payrollClock";
import {
  uploadDocumentAction,
  saveDocumentAction,
} from "./actions/uploadDocument";
import { registerWorkspaceActions } from "./actions/workspace";
import { registerWorkMemoryActions } from "./actions/workMemory";
import { registerClientRequestActions } from "./actions/clientRequest";
import { registerDailyLogActions } from "./actions/dailyLog";

let allRegistered = false;

/** Register core + server actions (idempotent). */
export function registerAllActions(): void {
  if (allRegistered) return;
  registerCoreActions();
  registerWorkspaceActions();
  registerWorkMemoryActions();
  registerClientRequestActions();
  registerDailyLogActions();
  if (!getAction("payroll_clock")) registerAction(payrollClockAction);
  if (!getAction("upload_document")) registerAction(uploadDocumentAction);
  if (!getAction("save_document")) registerAction(saveDocumentAction);
  allRegistered = true;
}
