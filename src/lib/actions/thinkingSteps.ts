import { collectThinkingSteps } from "./runner";
import type { ActionContext } from "./types";
import type { WorkspaceContextMeta } from "@/lib/workspace-context/types";

/** Build contextual thinking-panel steps for a Gideon request. */
export function buildGideonThinkingSteps(args: {
  actionCtx: ActionContext;
  meta: WorkspaceContextMeta;
}): string[] {
  const steps = collectThinkingSteps(args.actionCtx);
  const { meta } = args;

  const workspaceLabel =
    meta.retrievalScopes.length > 1
      ? meta.retrievalScopes.map((s) => s.display_name).join(", ")
      : meta.activeProfile.display_name;

  const workspaceStep = `Searching ${workspaceLabel}`;
  const enriched = [...steps];
  const understandIdx = enriched.indexOf("Understanding request");

  if (understandIdx >= 0 && !enriched.includes(workspaceStep)) {
    enriched.splice(understandIdx + 1, 0, workspaceStep);
  } else if (!enriched.includes(workspaceStep)) {
    enriched.unshift(workspaceStep);
  }

  if (!enriched.includes("Preparing answer")) {
    enriched.push("Preparing answer");
  }

  return enriched;
}
