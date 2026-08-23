export const GUARDIAN_START_SPLASH_KEY = "guardian.startSplash.seen";
export const GUARDIAN_START_SPLASH_BOOT_ID = "guardian-splash-boot-cover";
export const GUARDIAN_START_SPLASH_SEEN_CLASS = "guardian-splash-seen";

/**
 * Runs before the boot cover is parsed. Hides the cover only when the splash
 * was already shown this session — otherwise the SSR cover stays up.
 */
export const GUARDIAN_START_SPLASH_BOOT_SCRIPT = `(function(){try{if(sessionStorage.getItem(${JSON.stringify(GUARDIAN_START_SPLASH_KEY)})==="1"){document.documentElement.classList.add(${JSON.stringify(GUARDIAN_START_SPLASH_SEEN_CLASS)});}}catch(e){}})();`;

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

/** Hide the SSR boot cover (CSS) once the real splash or page is ready. */
export function clearStartSplashBoot(): void {
  document.documentElement.classList.add(GUARDIAN_START_SPLASH_SEEN_CLASS);
}
