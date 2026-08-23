export const GUARDIAN_START_SPLASH_KEY = "guardian.startSplash.seen";
export const GUARDIAN_START_SPLASH_BOOT_ID = "guardian-splash-boot-cover";
export const GUARDIAN_START_SPLASH_SEEN_CLASS = "guardian-splash-seen";
export const GUARDIAN_START_SPLASH_ACTIVE_CLASS = "guardian-splash-active";

/**
 * Runs before the boot cover is parsed. Hides the cover only when the splash
 * was already shown this session — otherwise locks scroll and keeps the cover.
 */
export const GUARDIAN_START_SPLASH_BOOT_SCRIPT = `(function(){try{var seen=sessionStorage.getItem(${JSON.stringify(GUARDIAN_START_SPLASH_KEY)})==="1";if(seen){document.documentElement.classList.add(${JSON.stringify(GUARDIAN_START_SPLASH_SEEN_CLASS)});}else{document.documentElement.classList.add(${JSON.stringify(GUARDIAN_START_SPLASH_ACTIVE_CLASS)});}}catch(e){document.documentElement.classList.add(${JSON.stringify(GUARDIAN_START_SPLASH_ACTIVE_CLASS)});}})();`;

export function readStartSplashSeen(): boolean {
  try {
    return window.sessionStorage.getItem(GUARDIAN_START_SPLASH_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeStartSplashSeen(): void {
  try {
    window.sessionStorage.setItem(GUARDIAN_START_SPLASH_KEY, "1");
  } catch {
    /* private mode / blocked storage */
  }
}

/** Hide the SSR boot cover once the real splash is ready. */
export function clearStartSplashBoot(): void {
  document.documentElement.classList.add(GUARDIAN_START_SPLASH_SEEN_CLASS);
}

export function setStartSplashScrollLock(locked: boolean): void {
  const root = document.documentElement;
  if (locked) root.classList.add(GUARDIAN_START_SPLASH_ACTIVE_CLASS);
  else root.classList.remove(GUARDIAN_START_SPLASH_ACTIVE_CLASS);
}
