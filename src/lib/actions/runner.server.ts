import "server-only";

import { getMatchingActions } from "./registry";
import { registerAllActions } from "./register";
import type { ActionContext, ActionDirectResult } from "./types";

registerAllActions();

/** Try to handle the question without invoking the LLM. */
export async function runDirectAction(
  ctx: ActionContext
): Promise<ActionDirectResult | null> {
  for (const action of getMatchingActions(ctx)) {
    if (!action.executeDirect) continue;
    const result = await action.executeDirect(ctx);
    if (result) return result;
  }
  return null;
}
