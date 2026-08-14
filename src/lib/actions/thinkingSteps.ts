import type { ActionContext } from "./types";
import type { WorkspaceContextMeta } from "@/lib/workspace-context/types";
import type { GideonRoute } from "@/lib/gideon/intent";

/** Build contextual thinking-panel steps for a Gideon request. */
export function buildGideonThinkingSteps(args: {
  actionCtx: ActionContext;
  meta: WorkspaceContextMeta;
  route?: GideonRoute;
}): string[] {
  if (args.route?.statusSteps.length) {
    return [...args.route.statusSteps];
  }

  return ["Thinking...", "Searching Guardian..."];
}
