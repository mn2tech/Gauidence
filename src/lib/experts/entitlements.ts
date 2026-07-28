import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlatformAdmin } from "@/lib/admin";
import type { ExpertCatalogItem } from "@/lib/experts/expert-schema";
import type { ExpertCatalogEntry } from "@/lib/experts/expert-types";
import { getExpertCatalog } from "@/lib/experts/load-expert";

export function getExpertVisibility(item: ExpertCatalogItem): "public" | "restricted" {
  return item.visibility ?? "restricted";
}

export function isExpertCatalogPublic(item: ExpertCatalogItem): boolean {
  return getExpertVisibility(item) === "public";
}

export async function listEntitledExpertIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("expert_entitlements")
    .select("expert_id")
    .eq("user_id", userId);

  if (error) {
    console.error("listEntitledExpertIds:", error.message);
    return [];
  }

  return (data ?? []).map((row) => row.expert_id as string);
}

export async function grantExpertEntitlement(
  admin: SupabaseClient,
  params: {
    userId: string;
    expertId: string;
    grantedBy?: string | null;
  }
): Promise<boolean> {
  const { error } = await admin.from("expert_entitlements").upsert(
    {
      user_id: params.userId,
      expert_id: params.expertId,
      granted_by: params.grantedBy ?? null,
      granted_at: new Date().toISOString(),
    },
    { onConflict: "user_id,expert_id" }
  );

  if (error) {
    console.error("grantExpertEntitlement:", error.message);
    return false;
  }
  return true;
}

export function filterCatalogForUser(
  catalog: ExpertCatalogEntry[],
  entitledIds: Set<string>,
  options?: { isAdmin?: boolean }
): ExpertCatalogEntry[] {
  const isAdmin = options?.isAdmin ?? false;
  return catalog.filter((item) => {
    if (item.effectiveStatus === "unavailable") return false;
    if (isAdmin) return true;
    if (isExpertCatalogPublic(item)) return true;
    return entitledIds.has(item.id);
  });
}

export async function userHasExpertAccess(
  supabase: SupabaseClient,
  userId: string,
  expertId: string,
  email?: string | null
): Promise<boolean> {
  if (isPlatformAdmin(email)) return true;

  const item = getExpertCatalog().find((entry) => entry.id === expertId);
  if (!item || item.effectiveStatus === "unavailable") return false;
  if (isExpertCatalogPublic(item)) return true;

  const { data: entitlement } = await supabase
    .from("expert_entitlements")
    .select("id")
    .eq("user_id", userId)
    .eq("expert_id", expertId)
    .maybeSingle();

  if (entitlement) return true;

  const { data: installation } = await supabase
    .from("user_experts")
    .select("id")
    .eq("user_id", userId)
    .eq("expert_id", expertId)
    .limit(1)
    .maybeSingle();

  return Boolean(installation);
}

export async function getCatalogForUser(
  supabase: SupabaseClient,
  userId: string,
  email?: string | null
): Promise<ExpertCatalogEntry[]> {
  const catalog = getExpertCatalog();
  const isAdmin = isPlatformAdmin(email);
  if (isAdmin) {
    return filterCatalogForUser(catalog, new Set(), { isAdmin: true });
  }

  const entitledIds = new Set(await listEntitledExpertIds(supabase, userId));
  return filterCatalogForUser(catalog, entitledIds, { isAdmin: false });
}
