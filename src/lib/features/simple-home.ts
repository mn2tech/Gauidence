import { isPlatformAdmin } from "@/lib/admin";

export type GuardianSimpleHomeFlag =
  | "disabled"
  | "admin-only"
  | "beta"
  | "enabled";

function readFlag(): GuardianSimpleHomeFlag {
  const raw =
    process.env.GUARDIAN_SIMPLE_HOME_FLAG?.trim().toLowerCase() ?? "disabled";
  if (
    raw === "disabled" ||
    raw === "admin-only" ||
    raw === "beta" ||
    raw === "enabled"
  ) {
    return raw;
  }
  return "disabled";
}

export function getGuardianSimpleHomeFlag(): GuardianSimpleHomeFlag {
  return readFlag();
}

export function canAccessSimpleHome(options?: {
  email?: string | null;
  isBetaUser?: boolean;
}): boolean {
  const flag = readFlag();
  if (flag === "enabled") return true;
  if (flag === "disabled") return false;
  if (flag === "admin-only") return isPlatformAdmin(options?.email);
  if (flag === "beta")
    return Boolean(options?.isBetaUser) || isPlatformAdmin(options?.email);
  return false;
}
