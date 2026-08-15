/**
 * Guardian Pack Engine feature flag.
 * Defaults to admin-only so internal orgs can test before wider rollout.
 */
import { NextResponse } from "next/server";
import { isPlatformAdmin } from "@/lib/admin";

export type GuardianPackEngineFlag =
  | "disabled"
  | "admin-only"
  | "beta"
  | "enabled";

function readFlag(): GuardianPackEngineFlag {
  const raw =
    process.env.GUARDIAN_PACK_ENGINE_FLAG?.trim().toLowerCase() ?? "admin-only";
  if (
    raw === "disabled" ||
    raw === "admin-only" ||
    raw === "beta" ||
    raw === "enabled"
  ) {
    return raw;
  }
  return "admin-only";
}

export function getGuardianPackEngineFlag(): GuardianPackEngineFlag {
  return readFlag();
}

export function isGuardianPackEngineEnabled(options?: {
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

export function packEngineBlockedResponse(): NextResponse {
  return NextResponse.json(
    { error: "Guardian Packs are not available for your account." },
    { status: 403 }
  );
}
