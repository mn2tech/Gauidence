/**
 * Server-side plan entitlement checks (Spaces, documents, Pro features).
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlatformAdmin } from "@/lib/admin";
import {
  getPlanSnapshot,
  type PlanSnapshot,
} from "@/lib/billing/quota";
import {
  isProPlan,
  PLAN_LABELS,
  type PlanId,
} from "@/lib/billing/plans";

export type EntitlementResult =
  | { ok: true; plan: PlanId; snap: PlanSnapshot }
  | { ok: false; response: NextResponse };

async function adminExempt(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string | null
): Promise<boolean> {
  if (userEmail?.trim() && isPlatformAdmin(userEmail)) return true;
  const { data } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  return isPlatformAdmin((data?.email as string | null) ?? null);
}

function limitResponse(message: string, plan: PlanId, feature: string) {
  return NextResponse.json(
    {
      error: message,
      code: "plan_limit",
      plan,
      feature,
      upgradeRequired: true,
    },
    { status: 429 }
  );
}

/** Count owned top-level Spaces (not nested members). */
export async function countOwnedTopLevelSpaces(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("guardian_profiles")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId)
    .is("parent_profile_id", null);
  if (error) return 0;
  return count ?? 0;
}

export async function countAccountDocuments(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return 0;
  return count ?? 0;
}

/**
 * Enforce Space creation quota. Call before inserting a new top-level Space.
 * nestedUnderParent skips the check (child Spaces under an existing parent).
 */
export async function assertSpaceCreationAllowed(
  supabase: SupabaseClient,
  userId: string,
  opts?: { nestedUnderParent?: boolean; userEmail?: string | null }
): Promise<EntitlementResult> {
  const snap = await getPlanSnapshot(supabase, userId);
  if (await adminExempt(supabase, userId, opts?.userEmail)) {
    return { ok: true, plan: snap.plan, snap };
  }
  if (opts?.nestedUnderParent) {
    return { ok: true, plan: snap.plan, snap };
  }

  const limit = snap.limits.spacesPerAccount;
  const used = await countOwnedTopLevelSpaces(supabase, userId);
  if (used >= limit) {
    return {
      ok: false,
      response: limitResponse(
        `The ${PLAN_LABELS[snap.plan]} plan includes ${limit} Space${limit === 1 ? "" : "s"}. Upgrade to Guardian Pro to create more.`,
        snap.plan,
        "spaces"
      ),
    };
  }
  return { ok: true, plan: snap.plan, snap };
}

/** Enforce document/item storage quota before upload. */
export async function assertDocumentCreationAllowed(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string | null
): Promise<EntitlementResult> {
  const snap = await getPlanSnapshot(supabase, userId);
  if (await adminExempt(supabase, userId, userEmail)) {
    return { ok: true, plan: snap.plan, snap };
  }
  const limit = snap.limits.documentsPerAccount;
  const used = await countAccountDocuments(supabase, userId);
  if (used >= limit) {
    return {
      ok: false,
      response: limitResponse(
        `You've reached the ${limit}-item limit on ${PLAN_LABELS[snap.plan]}. Upgrade to keep adding knowledge.`,
        snap.plan,
        "documents"
      ),
    };
  }
  return { ok: true, plan: snap.plan, snap };
}

/** Soft gate for Pro-only features (server-side). */
export async function assertProFeature(
  supabase: SupabaseClient,
  userId: string,
  feature: string,
  userEmail?: string | null
): Promise<EntitlementResult> {
  const snap = await getPlanSnapshot(supabase, userId);
  if (await adminExempt(supabase, userId, userEmail)) {
    return { ok: true, plan: snap.plan, snap };
  }
  if (isProPlan(snap.plan)) {
    return { ok: true, plan: snap.plan, snap };
  }
  return {
    ok: false,
    response: limitResponse(
      `“${feature}” is available on Guardian Pro. Your Free knowledge stays available — upgrade when you're ready.`,
      snap.plan,
      feature
    ),
  };
}
