import type { SupabaseClient } from "@supabase/supabase-js";
import { guardianReferralCode } from "@/lib/share/guardian";
import { recordProductEvent } from "@/lib/analytics/productEvents";
import {
  isUserReferralCode,
  REFERRAL_MAX_PER_YEAR,
  REFERRAL_REWARD_CENTS,
  utcYearStartIso,
  type ReferralStats,
} from "@/lib/share/referralConstants";

export {
  isUserReferralCode,
  REFERRAL_MAX_PER_YEAR,
  REFERRAL_REWARD_CENTS,
  utcYearStartIso,
  type ReferralStats,
} from "@/lib/share/referralConstants";

/**
 * Resolve 8-char code → profile id (UUID first segment).
 * Returns null if missing, ambiguous, or not found.
 */
export async function resolveReferrerUserId(
  admin: SupabaseClient,
  ref: string
): Promise<string | null> {
  if (!isUserReferralCode(ref)) return null;
  const code = ref.trim().toLowerCase();
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .ilike("id", `${code}-%`)
    .limit(2);
  if (error || !data?.length || data.length > 1) return null;
  return (data[0]?.id as string | undefined) ?? null;
}

/**
 * Persist signup_ref + referred_by once on the invitee profile.
 * Safe to call repeatedly; never overwrites an existing referred_by.
 */
export async function persistReferralAttribution(
  admin: SupabaseClient,
  inviteeUserId: string,
  rawRef: string | null | undefined
): Promise<{ signupRef: string | null; referredBy: string | null }> {
  const signupRef = rawRef?.trim() || null;
  if (!signupRef) {
    return { signupRef: null, referredBy: null };
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("signup_ref, referred_by_user_id")
    .eq("id", inviteeUserId)
    .maybeSingle();

  const alreadyReferred =
    (existing?.referred_by_user_id as string | null | undefined) ?? null;
  const alreadyRef =
    (existing?.signup_ref as string | null | undefined) ?? null;

  if (alreadyReferred) {
    return { signupRef: alreadyRef ?? signupRef, referredBy: alreadyReferred };
  }

  let referredBy: string | null = null;
  if (isUserReferralCode(signupRef)) {
    referredBy = await resolveReferrerUserId(admin, signupRef);
    if (referredBy === inviteeUserId) {
      referredBy = null;
    }
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (!alreadyRef) patch.signup_ref = signupRef;
  if (referredBy) patch.referred_by_user_id = referredBy;

  if (Object.keys(patch).length > 1) {
    await admin.from("profiles").update(patch).eq("id", inviteeUserId);
  }

  return {
    signupRef: alreadyRef ?? signupRef,
    referredBy,
  };
}

type GrantResult =
  | { status: "granted"; amountCents: number; balanceTxId: string }
  | { status: "skipped"; reason: string }
  | { status: "noop"; reason: string };

/**
 * When an invitee first becomes a paying subscriber, credit the referrer
 * one month of Pro via Stripe customer balance (idempotent per invitee).
 */
export async function maybeGrantReferralReward(
  admin: SupabaseClient,
  inviteeUserId: string
): Promise<GrantResult> {
  const { data: existingReward } = await admin
    .from("referral_rewards")
    .select("id, status")
    .eq("invitee_user_id", inviteeUserId)
    .maybeSingle();
  if (existingReward) {
    return { status: "noop", reason: "already_recorded" };
  }

  const { data: invitee } = await admin
    .from("profiles")
    .select("signup_ref, referred_by_user_id, email")
    .eq("id", inviteeUserId)
    .maybeSingle();

  let referredBy =
    (invitee?.referred_by_user_id as string | null | undefined) ?? null;
  const signupRef =
    (invitee?.signup_ref as string | null | undefined) ?? null;

  if (!referredBy && signupRef) {
    const persisted = await persistReferralAttribution(
      admin,
      inviteeUserId,
      signupRef
    );
    referredBy = persisted.referredBy;
  }

  if (!referredBy) {
    return { status: "noop", reason: "no_referrer" };
  }
  if (referredBy === inviteeUserId) {
    return { status: "noop", reason: "self_referral" };
  }

  if (signupRef && isUserReferralCode(signupRef)) {
    const expected = guardianReferralCode(referredBy);
    if (expected !== signupRef.trim().toLowerCase()) {
      return { status: "noop", reason: "ref_mismatch" };
    }
  }

  const yearStart = utcYearStartIso();
  const { count } = await admin
    .from("referral_rewards")
    .select("id", { count: "exact", head: true })
    .eq("referrer_user_id", referredBy)
    .eq("status", "granted")
    .gte("granted_at", yearStart);

  if ((count ?? 0) >= REFERRAL_MAX_PER_YEAR) {
    await admin.from("referral_rewards").insert({
      referrer_user_id: referredBy,
      invitee_user_id: inviteeUserId,
      signup_ref: signupRef,
      status: "skipped",
      skip_reason: "yearly_cap",
      amount_cents: 0,
    });
    return { status: "skipped", reason: "yearly_cap" };
  }

  const { getStripe } = await import("@/lib/billing/stripe");
  const stripe = getStripe();
  if (!stripe) {
    await admin.from("referral_rewards").insert({
      referrer_user_id: referredBy,
      invitee_user_id: inviteeUserId,
      signup_ref: signupRef,
      status: "skipped",
      skip_reason: "stripe_unconfigured",
      amount_cents: 0,
    });
    return { status: "skipped", reason: "stripe_unconfigured" };
  }

  const { data: referrer } = await admin
    .from("profiles")
    .select("stripe_customer_id, email, full_name")
    .eq("id", referredBy)
    .maybeSingle();

  let customerId =
    (referrer?.stripe_customer_id as string | null | undefined) ?? null;
  if (!customerId) {
    const email = (referrer?.email as string | null | undefined)?.trim();
    if (!email) {
      await admin.from("referral_rewards").insert({
        referrer_user_id: referredBy,
        invitee_user_id: inviteeUserId,
        signup_ref: signupRef,
        status: "skipped",
        skip_reason: "referrer_no_email",
        amount_cents: 0,
      });
      return { status: "skipped", reason: "referrer_no_email" };
    }
    const customer = await stripe.customers.create({
      email,
      name: (referrer?.full_name as string | null | undefined) ?? undefined,
      metadata: { supabase_user_id: referredBy },
    });
    customerId = customer.id;
    await admin
      .from("profiles")
      .update({
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", referredBy);
  }

  const amountCents = REFERRAL_REWARD_CENTS;
  const now = new Date().toISOString();

  const { data: locked, error: lockError } = await admin
    .from("referral_rewards")
    .insert({
      referrer_user_id: referredBy,
      invitee_user_id: inviteeUserId,
      signup_ref: signupRef,
      status: "granted",
      amount_cents: amountCents,
      granted_at: now,
    })
    .select("id")
    .maybeSingle();

  if (lockError || !locked?.id) {
    return { status: "noop", reason: "already_recorded" };
  }

  let balanceTxId: string;
  try {
    const tx = await stripe.customers.createBalanceTransaction(customerId, {
      amount: -amountCents,
      currency: "usd",
      description: "Guardian referral — 1 month Pro credit",
      metadata: {
        invitee_user_id: inviteeUserId,
        signup_ref: signupRef ?? "",
      },
    });
    balanceTxId = tx.id;
  } catch (err) {
    console.error(
      "Referral balance credit failed:",
      err instanceof Error ? err.message : err
    );
    await admin
      .from("referral_rewards")
      .update({
        status: "skipped",
        skip_reason: "stripe_error",
        amount_cents: 0,
        granted_at: null,
      })
      .eq("id", locked.id);
    return { status: "skipped", reason: "stripe_error" };
  }

  await admin
    .from("referral_rewards")
    .update({ stripe_balance_transaction_id: balanceTxId })
    .eq("id", locked.id);

  await recordProductEvent(admin, referredBy, "referral_reward_granted", {
    invitee_user_id: inviteeUserId,
    amount_cents: amountCents,
    balance_tx_id: balanceTxId,
  });

  return {
    status: "granted",
    amountCents,
    balanceTxId,
  };
}

export async function loadReferrerStats(
  supabase: SupabaseClient,
  referrerUserId: string
): Promise<ReferralStats> {
  const yearStart = utcYearStartIso();
  const { data, error } = await supabase
    .from("referral_rewards")
    .select("status, amount_cents, granted_at")
    .eq("referrer_user_id", referrerUserId)
    .eq("status", "granted");

  if (error) {
    return {
      grantedThisYear: 0,
      totalGranted: 0,
      totalCreditCents: 0,
      maxPerYear: REFERRAL_MAX_PER_YEAR,
      rewardCents: REFERRAL_REWARD_CENTS,
    };
  }

  const rows = data ?? [];
  const totalGranted = rows.length;
  const totalCreditCents = rows.reduce(
    (sum, r) => sum + (Number(r.amount_cents) || 0),
    0
  );
  const grantedThisYear = rows.filter(
    (r) =>
      typeof r.granted_at === "string" && r.granted_at >= yearStart
  ).length;

  return {
    grantedThisYear,
    totalGranted,
    totalCreditCents,
    maxPerYear: REFERRAL_MAX_PER_YEAR,
    rewardCents: REFERRAL_REWARD_CENTS,
  };
}
