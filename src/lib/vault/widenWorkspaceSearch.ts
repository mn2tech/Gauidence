import type { SearchScopeMode } from "@/lib/workspace-context/searchScope";

/**
 * When This-space search has no document hits but the user can access more
 * Spaces, widen this turn to All spaces so Ask doesn't dead-end in the wrong room.
 */
export function shouldWidenWorkspaceDocumentSearch(args: {
  searchScope: SearchScopeMode;
  hasExplicitSpaceFocus: boolean;
  retrievedChunkCount: number;
  accessibleProfileCount: number;
  workspaceSearchProfileCount: number;
}): boolean {
  if (args.searchScope !== "workspace") return false;
  if (args.hasExplicitSpaceFocus) return false;
  if (args.retrievedChunkCount > 0) return false;
  if (args.accessibleProfileCount <= args.workspaceSearchProfileCount) {
    return false;
  }
  return true;
}
