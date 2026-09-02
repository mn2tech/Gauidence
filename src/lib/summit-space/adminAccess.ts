import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlatformAdmin } from "@/lib/admin";
import { isSummitOwner } from "./linkProfile";

export async function canAccessSummitAdmin(
  supabase: SupabaseClient,
  summitSlug: string,
  userId: string,
  email?: string | null
): Promise<boolean> {
  if (isPlatformAdmin(email)) return true;
  return isSummitOwner(supabase, summitSlug, userId);
}

export async function isSummitLinked(
  supabase: SupabaseClient,
  summitSlug: string
): Promise<boolean> {
  const { data: space } = await supabase
    .from("summit_spaces")
    .select("profile_id")
    .eq("slug", summitSlug)
    .maybeSingle();

  return Boolean(space?.profile_id);
}

export type SummitAdminAuthResult =
  | { ok: true; userId: string; email: string | null; profileId: string | null }
  | { ok: false; error: string; status: 401 | 403 | 503 };

export async function requireSummitAdmin(
  supabase: SupabaseClient | null,
  summitSlug: string
): Promise<SummitAdminAuthResult> {
  if (!supabase) {
    return { ok: false, error: "Guardian is not configured", status: 503 };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Sign in required", status: 401 };
  }

  const allowed = await canAccessSummitAdmin(
    supabase,
    summitSlug,
    user.id,
    user.email
  );

  if (!allowed) {
    return { ok: false, error: "Not authorized", status: 403 };
  }

  const { data: space } = await supabase
    .from("summit_spaces")
    .select("profile_id")
    .eq("slug", summitSlug)
    .maybeSingle();

  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    profileId: space?.profile_id ?? null,
  };
}
