/**
 * Centralized application clock.
 * Prefer this (or injectable `now` options) over scattering `new Date()` in
 * temporal/lifecycle logic so tests can freeze time deterministically.
 */

let overrideNow: Date | null = null;

/** Current application time (UTC instant). */
export function appNow(): Date {
  return overrideNow ? new Date(overrideNow.getTime()) : new Date();
}

/** ISO-8601 string for the current application time. */
export function appNowIso(): string {
  return appNow().toISOString();
}

/**
 * Temporarily override application time (tests / deterministic reevaluation).
 * Returns a restore function.
 */
export function withAppNow(fixed: Date, run: () => void): void;
export function withAppNow<T>(fixed: Date, run: () => T): T;
export function withAppNow<T>(fixed: Date, run: () => T): T {
  const prev = overrideNow;
  overrideNow = new Date(fixed.getTime());
  try {
    return run();
  } finally {
    overrideNow = prev;
  }
}

/** Resolve an optional injected now, falling back to appNow(). */
export function resolveNow(now?: Date): Date {
  return now ?? appNow();
}
