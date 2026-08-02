import { getMatchingActions } from "./registry";
import { registerCoreActions } from "./actions/core";
import { registerWorkspaceActions } from "./actions/workspace";
import type {
  ActionContext,
  ActionDirectResult,
  ActionEvent,
} from "./types";

registerCoreActions();
registerWorkspaceActions();

/** Collect system prompt notes from all matching actions. */
export function collectActionSystemNotes(ctx: ActionContext): string {
  return getMatchingActions(ctx)
    .map((action) => action.systemNote?.(ctx) ?? "")
    .filter(Boolean)
    .join("\n");
}

/** Build thinking-panel steps for matching actions. */
export function collectThinkingSteps(ctx: ActionContext): string[] {
  const steps: string[] = ["Understanding request"];
  for (const action of getMatchingActions(ctx)) {
    if (action.thinkingSteps) {
      for (const step of action.thinkingSteps) {
        if (step !== "Understanding request" && !steps.includes(step)) {
          steps.push(step);
        }
      }
    }
  }
  if (steps.length === 1) steps.push("Preparing answer");
  return steps;
}

/** Emit structured action events for timeline / thinking panel. */
export function buildActionEvents(
  ctx: ActionContext,
  phase: ActionEvent["phase"] = "detected"
): ActionEvent[] {
  const now = Date.now();
  return getMatchingActions(ctx).map((action) => ({
    actionId: action.id,
    label: action.label,
    phase,
    timestamp: now,
  }));
}
