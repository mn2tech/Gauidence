import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCheckoutPlan } from "@/lib/billing/plans";
import {
  appBaseUrl,
  checkoutLineItem,
  getStripe,
  isStripeBillingConfigured,
} from "@/lib/billing/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isStripeBillingConfigured()) {
    return NextResponse.json(
      { error: "Billing isn't set up yet on this deployment." },
      { status: 503 }
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Billing isn't set up yet on this deployment." },
      { status: 503 }
    );
  }

  let requestedPlan: unknown = "personal";
  try {
    const body = await request.json();
    if (body?.plan != null) requestedPlan = body.plan;
  } catch {
    // default personal
  }
  const plan = parseCheckoutPlan(requestedPlan);
  if (!plan) {
    return NextResponse.json(
      { error: "Choose Personal, Family, or Business." },
      { status: 400 }
    );
  }

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
  if (!user?.email) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Billing can't update your account right now." },
      { status: 503 }
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, plan, email, stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();

  let customerId = profile?.stripe_customer_id as string | null | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.user_metadata?.full_name ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await admin
      .from("profiles")
      .update({
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
  }

  const base = appBaseUrl(request);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [checkoutLineItem(plan)],
    success_url: `${base}/settings?billing=success&plan=${plan}`,
    cancel_url: `${base}/settings?billing=canceled`,
    metadata: {
      supabase_user_id: user.id,
      guardian_plan: plan,
    },
    subscription_data: {
      metadata: {
        supabase_user_id: user.id,
        guardian_plan: plan,
      },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Stripe did not return a checkout URL." },
      { status: 502 }
    );
  }

  return NextResponse.json({ url: session.url, plan });
}
