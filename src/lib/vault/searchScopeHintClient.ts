/** Client-only: one-time “This space vs all spaces” hint. */

export const SEARCH_SCOPE_HINT_SEEN_KEY = "guardian:search-scope-hint-seen";

export function readSearchScopeHintSeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SEARCH_SCOPE_HINT_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSearchScopeHintSeen(seen: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (seen) window.localStorage.setItem(SEARCH_SCOPE_HINT_SEEN_KEY, "1");
    else window.localStorage.removeItem(SEARCH_SCOPE_HINT_SEEN_KEY);
  } catch {
    /* ignore */
  }
}
