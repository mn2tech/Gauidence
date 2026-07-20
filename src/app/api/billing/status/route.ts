import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlanSnapshot, getUsageCounts } from "@/lib/billing/quota";
import {
  PAID_PLAN_IDS,
  PLAN_LABELS,
  PLAN_LIMITS,
  PLAN_PRICE_DISPLAY,
  planRank,
} from "@/lib/billing/plans";
import { isStripeBillingConfigured } from "@/lib/billing/stripe";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Sign-in isn't configured on this deployment." },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  const snap = await getPlanSnapshot(supabase, user.id);
  const usage = await getUsageCounts(supabase, user.id);
  const rank = planRank(snap.plan);

  return NextResponse.json({
    billingConfigured: isStripeBillingConfigured(),
    plan: snap.plan,
    planLabel: PLAN_LABELS[snap.plan],
    prices: PLAN_PRICE_DISPLAY,
    personalPrice: PLAN_PRICE_DISPLAY.personal,
    limits: snap.limits,
    catalog: PAID_PLAN_IDS.map((id) => ({
      id,
      label: PLAN_LABELS[id],
      price: PLAN_PRICE_DISPLAY[id],
      limits: PLAN_LIMITS[id],
      canUpgradeTo: planRank(id) > rank,
    })),
    usage: {
      analyze: usage.analyze,
      chat: usage.chat,
      research: usage.research,
    },
    periodStart: usage.periodStart,
    subscriptionStatus: snap.stripeSubscriptionStatus,
    hasCustomer: Boolean(snap.stripeCustomerId),
  });
}
