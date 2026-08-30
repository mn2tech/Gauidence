import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/admin";

export const runtime = "nodejs";

type FunnelCounts = {
  signups: number;
  firstSpace: number;
  firstItem: number;
  firstValue: number;
  firstGideon: number;
  upgradePrompts: number;
  paidSubscribers: number;
  activationRate: number;
  conversionRate: number;
};

/**
 * Admin-only activation → paid conversion funnel.
 */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isPlatformAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = createAdminClient() ?? supabase;

  const [
    signupsRes,
    spaceEvents,
    itemEvents,
    valueEvents,
    gideonEvents,
    upgradeEvents,
    paidRes,
  ] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin
      .from("product_events")
      .select("user_id")
      .eq("event_name", "space_created"),
    admin
      .from("product_events")
      .select("user_id")
      .in("event_name", ["first_item_added", "first_document_uploaded"]),
    admin
      .from("product_events")
      .select("user_id")
      .in("event_name", ["first_value_reached", "first_win_shown"]),
    admin
      .from("product_events")
      .select("user_id")
      .in("event_name", ["first_gideon_question", "first_gideon_ask"]),
    admin
      .from("product_events")
      .select("user_id")
      .eq("event_name", "upgrade_prompt_shown"),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .neq("plan", "free"),
  ]);

  const unique = (rows: { user_id: string | null }[] | null) =>
    new Set((rows ?? []).map((r) => r.user_id).filter(Boolean)).size;

  const signups = signupsRes.count ?? 0;
  const firstSpaceFromEvents = unique(
    spaceEvents.data as { user_id: string | null }[] | null
  );
  const firstItem = unique(itemEvents.data as { user_id: string | null }[] | null);
  const firstValue = unique(valueEvents.data as { user_id: string | null }[] | null);
  const firstGideon = unique(
    gideonEvents.data as { user_id: string | null }[] | null
  );
  const upgradePrompts = unique(
    upgradeEvents.data as { user_id: string | null }[] | null
  );
  const paidSubscribers = paidRes.count ?? 0;

  // Also count users who own a top-level Space (auto-created or converted).
  const { data: ownedSpaces } = await admin
    .from("guardian_profiles")
    .select("owner_user_id")
    .is("parent_profile_id", null);
  const firstSpaceFromDb = unique(
    (ownedSpaces ?? []).map((r) => ({
      user_id: r.owner_user_id as string | null,
    }))
  );
  const firstSpace = Math.max(firstSpaceFromEvents, firstSpaceFromDb);

  const funnel: FunnelCounts = {
    signups,
    firstSpace,
    firstItem,
    firstValue,
    firstGideon,
    upgradePrompts,
    paidSubscribers,
    activationRate: signups > 0 ? Math.round((firstValue / signups) * 1000) / 10 : 0,
    conversionRate:
      signups > 0
        ? Math.round((paidSubscribers / signups) * 1000) / 10
        : 0,
  };

  // Fallback when product_events table is missing — use profile columns.
  if (spaceEvents.error || itemEvents.error) {
    const { count: withValue } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .not("first_value_reached_at", "is", null);
    const { count: completed } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .not("onboarding_completed_at", "is", null);

    funnel.firstValue = withValue ?? funnel.firstValue;
    funnel.firstSpace = completed ?? funnel.firstSpace;
    funnel.activationRate =
      signups > 0
        ? Math.round(((withValue ?? 0) / signups) * 1000) / 10
        : 0;
  }

  return NextResponse.json({ funnel });
}
