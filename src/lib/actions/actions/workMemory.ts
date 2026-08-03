import {
  workMemoryUpdateSystemNote,
  wantsWorkMemoryUpdate,
} from "@/lib/work-memory/propose";
import { registerAction, getAction } from "../registry";
import type { ActionDefinition } from "../types";

export const updateWorkMemoryAction: ActionDefinition = {
  id: "update_work_memory",
  label: "Update Work Memory",
  description:
    "Propose Work Memory project field updates for user confirmation.",
  matches: (question, ctx) =>
    wantsWorkMemoryUpdate(question, {
      focusedWorkProject: Boolean(ctx.workProjectId),
    }),
  systemNote: (ctx) => workMemoryUpdateSystemNote(ctx.workProjectId),
  requiresConfirmation: true,
  thinkingSteps: [
    "Understanding request",
    "Reviewing Work Memory",
    "Preparing project update",
  ],
};

let registered = false;

export function registerWorkMemoryActions(): void {
  if (registered) return;
  if (!getAction("update_work_memory")) registerAction(updateWorkMemoryAction);
  registered = true;
}
