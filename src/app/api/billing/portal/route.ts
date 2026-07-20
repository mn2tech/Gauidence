import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appBaseUrl, getStripe, isStripeBillingConfigured } from "@/lib/billing/stripe";

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

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Billing can't open the portal right now." },
      { status: 503 }
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const customerId = profile?.stripe_customer_id as string | null | undefined;
  if (!customerId) {
    return NextResponse.json(
      { error: "No billing account yet. Upgrade to Personal first." },
      { status: 400 }
    );
  }

  const base = appBaseUrl(request);
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${base}/settings`,
  });

  return NextResponse.json({ url: portal.url });
}
