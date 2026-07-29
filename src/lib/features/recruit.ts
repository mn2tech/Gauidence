import { isPlatformAdmin } from "@/lib/admin";

export type GuardianRecruitFlag =
  | "disabled"
  | "admin-only"
  | "beta"
  | "enabled";

function readFlag(): GuardianRecruitFlag {
  const raw =
    process.env.GUARDIAN_RECRUIT_FLAG?.trim().toLowerCase() ?? "enabled";
  if (
    raw === "disabled" ||
    raw === "admin-only" ||
    raw === "beta" ||
    raw === "enabled"
  ) {
    return raw;
  }
  return "enabled";
}

export function getGuardianRecruitFlag(): GuardianRecruitFlag {
  return readFlag();
}

export function canAccessGuardianRecruit(options?: {
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

export function recruitFeatureBlockedResponse(): Response {
  return Response.json(
    { error: "Guardian Recruit is not available for your account." },
    { status: 403 }
  );
}
