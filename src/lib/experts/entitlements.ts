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

export type ExpertEntitlementRecord = {
  id: string;
  userId: string;
  expertId: string;
  email: string | null;
  fullName: string | null;
  grantedAt: string;
  grantedBy: string | null;
  installationCount: number;
};

export async function listExpertEntitlements(
  admin: SupabaseClient,
  filters?: { expertId?: string; email?: string }
): Promise<ExpertEntitlementRecord[]> {
  let query = admin
    .from("expert_entitlements")
    .select("id, user_id, expert_id, granted_at, granted_by")
    .order("granted_at", { ascending: false })
    .limit(200);

  if (filters?.expertId?.trim()) {
    query = query.eq("expert_id", filters.expertId.trim());
  }

  if (filters?.email?.trim()) {
    const normalized = filters.email.trim().toLowerCase();
    const { data: profileMatches } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", `%${normalized}%`)
      .limit(50);

    const userIds = (profileMatches ?? []).map((row) => row.id as string);
    if (userIds.length === 0) return [];
    query = query.in("user_id", userIds);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error("listExpertEntitlements:", error.message);
    return [];
  }

  if (!rows?.length) return [];

  const userIds = [...new Set(rows.map((row) => row.user_id as string))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", userIds);

  const profileById = new Map(
    (profiles ?? []).map((profile) => [
      profile.id as string,
      {
        email: (profile.email as string | null) ?? null,
        fullName: (profile.full_name as string | null) ?? null,
      },
    ])
  );

  const { data: installations } = await admin
    .from("user_experts")
    .select("user_id, expert_id")
    .in("user_id", userIds);

  const installCounts = new Map<string, number>();
  for (const install of installations ?? []) {
    const key = `${install.user_id as string}:${install.expert_id as string}`;
    installCounts.set(key, (installCounts.get(key) ?? 0) + 1);
  }

  return rows.map((row) => {
    const userId = row.user_id as string;
    const expertId = row.expert_id as string;
    const profile = profileById.get(userId);
    return {
      id: row.id as string,
      userId,
      expertId,
      email: profile?.email ?? null,
      fullName: profile?.fullName ?? null,
      grantedAt: row.granted_at as string,
      grantedBy: (row.granted_by as string | null) ?? null,
      installationCount: installCounts.get(`${userId}:${expertId}`) ?? 0,
    };
  });
}

export async function revokeExpertAccess(
  admin: SupabaseClient,
  params: { userId: string; expertId: string }
): Promise<{ ok: true; installationsRemoved: number } | { ok: false; error: string }> {
  const { error: entitlementError } = await admin
    .from("expert_entitlements")
    .delete()
    .eq("user_id", params.userId)
    .eq("expert_id", params.expertId);

  if (entitlementError) {
    console.error("revokeExpertAccess entitlement:", entitlementError.message);
    return { ok: false, error: "Couldn't revoke expert access." };
  }

  const { data: removedInstallations, error: installError } = await admin
    .from("user_experts")
    .delete()
    .eq("user_id", params.userId)
    .eq("expert_id", params.expertId)
    .select("id");

  if (installError) {
    console.error("revokeExpertAccess installations:", installError.message);
    return { ok: false, error: "Access was revoked but installations could not be removed." };
  }

  return {
    ok: true,
    installationsRemoved: removedInstallations?.length ?? 0,
  };
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

  return Boolean(entitlement);
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
