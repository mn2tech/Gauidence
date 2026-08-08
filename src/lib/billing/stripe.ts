import "server-only";

import Stripe from "stripe";
import { getAppBaseUrl } from "@/lib/url/appBaseUrl";
import {
  isPaidPlanId,
  PLAN_PRODUCT_COPY,
  PLAN_UNIT_AMOUNT_CENTS,
  type PaidPlanId,
} from "./plans";

let cached: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    cached = null;
    return null;
  }
  cached = new Stripe(key, {
    apiVersion: "2026-06-24.dahlia",
    typescript: true,
  });
  return cached;
}

export function isStripeBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function isStripeWebhookConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
      process.env.STRIPE_WEBHOOK_SECRET?.trim()
  );
}

/** Optional saved Price IDs; otherwise Checkout uses inline price_data. */
export function savedPriceIdForPlan(plan: PaidPlanId): string | null {
  const envKey =
    plan === "personal"
      ? "STRIPE_PRICE_PERSONAL"
      : plan === "family"
        ? "STRIPE_PRICE_FAMILY"
        : "STRIPE_PRICE_BUSINESS";
  const id = process.env[envKey]?.trim();
  return id || null;
}

/** @deprecated use savedPriceIdForPlan("personal") */
export function personalPriceId(): string | null {
  return savedPriceIdForPlan("personal");
}

export function checkoutLineItem(plan: PaidPlanId): Stripe.Checkout.SessionCreateParams.LineItem {
  const saved = savedPriceIdForPlan(plan);
  if (saved) return { price: saved, quantity: 1 };
  const copy = PLAN_PRODUCT_COPY[plan];
  return {
    quantity: 1,
    price_data: {
      currency: "usd",
      unit_amount: PLAN_UNIT_AMOUNT_CENTS[plan],
      recurring: { interval: "month" },
      product_data: {
        name: copy.name,
        description: copy.description,
        metadata: { guardian_plan: plan },
      },
    },
  };
}

export function resolvePlanFromSubscription(sub: Stripe.Subscription): PaidPlanId | null {
  const fromMeta = sub.metadata?.guardian_plan?.trim();
  if (isPaidPlanId(fromMeta)) return fromMeta;

  for (const item of sub.items.data) {
    const product = item.price.product;
    if (typeof product === "object" && product && !("deleted" in product && product.deleted)) {
      const pMeta = (product as Stripe.Product).metadata?.guardian_plan?.trim();
      if (isPaidPlanId(pMeta)) return pMeta;
      const name = ((product as Stripe.Product).name ?? "").toLowerCase();
      if (name.includes("business")) return "business";
      if (name.includes("family")) return "family";
      if (name.includes("personal")) return "personal";
    }
    const amount = item.price.unit_amount;
    if (amount === PLAN_UNIT_AMOUNT_CENTS.business) return "business";
    if (amount === PLAN_UNIT_AMOUNT_CENTS.family) return "family";
    if (amount === PLAN_UNIT_AMOUNT_CENTS.personal) return "personal";
  }
  return null;
}

export function appBaseUrl(request?: Request): string {
  return getAppBaseUrl({ request });
}
