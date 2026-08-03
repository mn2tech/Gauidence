/** Client-only: whether the user has seen the full Ask Gideon welcome. */

export const GIDEON_WELCOME_SEEN_KEY = "guardian:gideon-welcome-seen";

export function readGideonWelcomeSeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GIDEON_WELCOME_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeGideonWelcomeSeen(seen: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (seen) window.localStorage.setItem(GIDEON_WELCOME_SEEN_KEY, "1");
    else window.localStorage.removeItem(GIDEON_WELCOME_SEEN_KEY);
  } catch {
    /* ignore */
  }
}
