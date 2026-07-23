import { isPlatformAdmin } from "@/lib/admin";

export type GuardianExpertsFlag =
  | "disabled"
  | "admin-only"
  | "beta"
  | "enabled";

function readFlag(): GuardianExpertsFlag {
  const raw = process.env.GUARDIAN_EXPERTS_FLAG?.trim().toLowerCase() ?? "disabled";
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

export function getGuardianExpertsFlag(): GuardianExpertsFlag {
  return readFlag();
}

export function canAccessGuardianExperts(options?: {
  email?: string | null;
  isBetaUser?: boolean;
}): boolean {
  const flag = readFlag();
  if (flag === "enabled") return true;
  if (flag === "disabled") return false;
  if (flag === "admin-only") return isPlatformAdmin(options?.email);
  if (flag === "beta") return Boolean(options?.isBetaUser) || isPlatformAdmin(options?.email);
  return false;
}

export function expertsFeatureBlockedResponse(): Response {
  return Response.json(
    { error: "Guardian Experts is not available for your account." },
    { status: 403 }
  );
}
