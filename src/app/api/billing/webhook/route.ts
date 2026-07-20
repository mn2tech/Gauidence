import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, resolvePlanFromSubscription } from "@/lib/billing/stripe";
import {
  isPaidPlanId,
  isPaidSubscriptionStatus,
  type PlanId,
} from "@/lib/billing/plans";

export const runtime = "nodejs";

async function applySubscription(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
  sub: Stripe.Subscription,
  planHint?: string | null
) {
  const paid = isPaidSubscriptionStatus(sub.status);
  const fromSub = resolvePlanFromSubscription(sub);
  const fromHint = isPaidPlanId(planHint) ? planHint : null;
  const plan: PlanId = paid ? fromSub ?? fromHint ?? "personal" : "free";

  const { data: existing } = await admin
    .from("profiles")
    .select("stripe_subscription_id")
    .eq("id", userId)
    .maybeSingle();

  const previousSubId = existing?.stripe_subscription_id as string | null | undefined;
  if (
    previousSubId &&
    previousSubId !== sub.id &&
    paid
  ) {
    const stripe = getStripe();
    if (stripe) {
      try {
        await stripe.subscriptions.cancel(previousSubId);
      } catch (err) {
        console.error("Could not cancel previous subscription:", previousSubId, err);
      }
    }
  }

  await admin
    .from("profiles")
    .update({
      plan,
      stripe_customer_id:
        typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      stripe_subscription_id: sub.id,
      stripe_subscription_status: sub.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

async function resolveUserId(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  sub: Stripe.Subscription,
  fallbackCustomerId?: string | null
): Promise<string | null> {
  const fromMeta = sub.metadata?.supabase_user_id?.trim();
  if (fromMeta) return fromMeta;

  const customerId =
    fallbackCustomerId ??
    (typeof sub.customer === "string" ? sub.customer : sub.customer?.id);
  if (!customerId) return null;

  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Admin client missing." }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("Stripe webhook signature failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;
        const userId =
          session.metadata?.supabase_user_id?.trim() ||
          session.client_reference_id?.trim();
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (!userId || !subId) break;
        const sub = await stripe.subscriptions.retrieve(subId);
        await applySubscription(
          admin,
          userId,
          sub,
          session.metadata?.guardian_plan
        );
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserId(admin, sub);
        if (userId) await applySubscription(admin, userId, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserId(admin, sub);
        if (!userId) break;
        const { data: profile } = await admin
          .from("profiles")
          .select("stripe_subscription_id")
          .eq("id", userId)
          .maybeSingle();
        // Ignore deletes of an old sub after an upgrade replaced it.
        if (
          profile?.stripe_subscription_id &&
          profile.stripe_subscription_id !== sub.id
        ) {
          break;
        }
        await admin
          .from("profiles")
          .update({
            plan: "free",
            stripe_subscription_status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
