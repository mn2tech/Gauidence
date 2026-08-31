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

/**
 * Named-Space focus (e.g. "Tesla" while in Nolan) returned nothing — search
 * everywhere instead of sticky-dead-ending in an empty Space.
 */
export function shouldWidenAfterFocusedSpaceMiss(args: {
  hadNamedSpaceFocus: boolean;
  retrievedChunkCount: number;
  accessibleProfileCount: number;
  focusedSearchProfileCount: number;
}): boolean {
  if (!args.hadNamedSpaceFocus) return false;
  if (args.retrievedChunkCount > 0) return false;
  if (args.accessibleProfileCount <= args.focusedSearchProfileCount) {
    return false;
  }
  return true;
}

/** Sticky chat scope only when retrieval actually hit that Space. */
export function shouldPersistChatScopedProfile(args: {
  scopedProfileId: string;
  activeProfileId: string;
  retrievedChunks: { profile_id?: string }[];
}): boolean {
  if (!args.scopedProfileId || args.scopedProfileId === args.activeProfileId) {
    return false;
  }
  return args.retrievedChunks.some(
    (c) => c.profile_id === args.scopedProfileId
  );
}
