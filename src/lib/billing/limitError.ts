const PLAN_LIMIT_MESSAGE =
  /You've used all \d+ .+ on the .+ plan this month/i;

const LEGACY_UPGRADE_SUFFIX =
  / Upgrade to Personal, Family, or Business in Settings for higher limits\.?$/;

const LEGACY_UPGRADE_SUFFIX_ALT =
  / Upgrade your plan in Settings for a higher monthly allowance\.?$/;

export function isPlanLimitCode(code?: string | null): boolean {
  return code === "plan_limit";
}

export function isPlanLimitMessage(message: string): boolean {
  return PLAN_LIMIT_MESSAGE.test(message);
}

export function normalizePlanLimitMessage(message: string): string {
  return message
    .replace(LEGACY_UPGRADE_SUFFIX, "")
    .replace(LEGACY_UPGRADE_SUFFIX_ALT, "")
    .trim();
}

export function shouldShowPlanUpgradeLink(
  message: string,
  code?: string | null
): boolean {
  return isPlanLimitCode(code) || isPlanLimitMessage(message);
}
