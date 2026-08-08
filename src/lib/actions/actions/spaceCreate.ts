import { wantsSpaceCreate } from "@/lib/profiles/proposeCreate";
import { registerAction, getAction } from "../registry";
import type { ActionDefinition } from "../types";

export const createSpaceAction: ActionDefinition = {
  id: "create_space",
  label: "Create Space",
  description:
    "Propose a new Space or Workspace for user confirmation with explicit placement.",
  matches: (question) => wantsSpaceCreate(question),
  requiresConfirmation: true,
  thinkingSteps: [
    "Understanding request",
    "Choosing space type",
    "Preparing space proposal",
  ],
};

let registered = false;

export function registerSpaceCreateActions(): void {
  if (registered) return;
  if (!getAction("create_space")) registerAction(createSpaceAction);
  registered = true;
}
