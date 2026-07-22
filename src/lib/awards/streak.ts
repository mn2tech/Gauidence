/**
 * Pure helpers for daily-log streak awards.
 */

/** True when log dates include any run of `minDays` consecutive calendar days. */
export function hasConsecutiveLogStreak(
  logDates: string[],
  minDays = 7
): boolean {
  if (logDates.length < minDays) return false;

  const unique = [...new Set(logDates)].sort();
  let streak = 1;

  for (let i = 1; i < unique.length; i++) {
    const prev = parseDateOnly(unique[i - 1]!);
    const curr = parseDateOnly(unique[i]!);
    const diffDays = Math.round((curr - prev) / 86_400_000);
    if (diffDays === 1) {
      streak += 1;
      if (streak >= minDays) return true;
    } else if (diffDays > 1) {
      streak = 1;
    }
  }

  return false;
}

function parseDateOnly(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!, 12);
}
