/** Client-safe workspace context helpers (no server-only imports). */
export {
  buildWorkingInDisplay,
  profileIdsForSearchScope,
  searchScopeLabel,
  searchScopeHeading,
  searchScopeHint,
  parseSearchScope,
  isSearchScopeMode,
  formatSearchConfidence,
  SEARCH_SCOPE_MODES,
  SEARCH_SCOPE_FIRST_HINT,
  type SearchScopeMode,
  type WorkingInDisplay,
} from "./searchScope";
