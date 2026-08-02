import { registerAction } from "../registry";
import type { ActionDefinition } from "../types";

const SWITCH_WORKSPACE_INTENT =
  /\b(switch\s+to|open|go\s+to|use)\s+(?:my\s+|the\s+)?(?:family|business|personal|workspace|vault)\b/i;

const SEARCH_EVERYWHERE_INTENT =
  /\b(search\s+(?:everywhere|all\s+workspaces|all\s+vaults)|search\s+all)\b/i;

export const switchWorkspaceAction: ActionDefinition = {
  id: "switch_workspace",
  label: "Switch Workspace",
  description: "Switch the active workspace or vault context.",
  matches: (question) => SWITCH_WORKSPACE_INTENT.test(question.trim()),
  thinkingSteps: ["Understanding request", "Switching workspace"],
};

export const searchEverywhereAction: ActionDefinition = {
  id: "search_everywhere",
  label: "Search Everywhere",
  description: "Search across all accessible workspaces.",
  matches: (question) => SEARCH_EVERYWHERE_INTENT.test(question.trim()),
  thinkingSteps: [
    "Understanding request",
    "Searching all workspaces",
    "Ranking relevance",
  ],
};

let registered = false;

export function registerWorkspaceActions(): void {
  if (registered) return;
  registerAction(switchWorkspaceAction);
  registerAction(searchEverywhereAction);
  registered = true;
}
