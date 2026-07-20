import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlanSnapshot, getUsageCounts } from "@/lib/billing/quota";
import { PLAN_LABELS, PERSONAL_PRICE_DISPLAY } from "@/lib/billing/plans";
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

  return NextResponse.json({
    billingConfigured: isStripeBillingConfigured(),
    plan: snap.plan,
    planLabel: PLAN_LABELS[snap.plan],
    personalPrice: PERSONAL_PRICE_DISPLAY,
    limits: snap.limits,
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
