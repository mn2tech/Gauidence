import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";
import {
  normalizePlan,
  PLAN_LIMITS,
  PLAN_LABELS,
  type PlanId,
  type PlanLimits,
} from "./plans";

export type BillingFeature = "analyze" | "chat" | "research";

export type PlanSnapshot = {
  plan: PlanId;
  limits: PlanLimits;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Start of the current calendar month in the product timezone (as ISO instant). */
export function billingMonthStartIso(
  now = new Date(),
  timeZone: string = GUARDIAN_TIME_ZONE
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  // Approximate: month boundary as UTC midnight on the 1st (quota windows are soft).
  return `${y}-${pad2(m)}-01T00:00:00.000Z`;
}

export async function getPlanSnapshot(
  supabase: SupabaseClient,
  userId: string
): Promise<PlanSnapshot> {
  const { data } = await supabase
    .from("profiles")
    .select(
      "plan, stripe_customer_id, stripe_subscription_id, stripe_subscription_status"
    )
    .eq("id", userId)
    .maybeSingle();

  const plan = normalizePlan(data?.plan);
  return {
    plan,
    limits: PLAN_LIMITS[plan],
    stripeCustomerId: (data?.stripe_customer_id as string | null) ?? null,
    stripeSubscriptionId: (data?.stripe_subscription_id as string | null) ?? null,
    stripeSubscriptionStatus:
      (data?.stripe_subscription_status as string | null) ?? null,
  };
}

function monthLimit(limits: PlanLimits, feature: BillingFeature): number {
  if (feature === "analyze") return limits.analyzePerMonth;
  if (feature === "research") return limits.researchPerMonth;
  return limits.chatPerMonth;
}

function hourLimit(limits: PlanLimits, feature: BillingFeature): number {
  if (feature === "analyze") return limits.analyzePerHour;
  if (feature === "research") return limits.researchPerHour;
  return limits.chatPerHour;
}

function upgradeHint(plan: PlanId): string {
  if (plan === "free") {
    return " Upgrade to Personal, Family, or Business in Settings for higher limits.";
  }
  if (plan === "personal" || plan === "family") {
    return " Upgrade your plan in Settings for a higher monthly allowance.";
  }
  return " Your Business monthly allowance resets at the start of next month.";
}

/**
 * Enforce monthly + hourly quotas. Returns a 429 Response when over limit.
 */
export async function assertBillingQuota(
  supabase: SupabaseClient,
  userId: string,
  feature: BillingFeature
): Promise<{ ok: true; plan: PlanId } | { ok: false; response: NextResponse }> {
  const snap = await getPlanSnapshot(supabase, userId);
  const monthStart = billingMonthStartIso();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const mLimit = monthLimit(snap.limits, feature);
  const hLimit = hourLimit(snap.limits, feature);

  if (feature === "analyze") {
    const { count: monthCount, error: mErr } = await supabase
      .from("analysis_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart);
    if (mErr) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "We couldn't check your plan usage. Please try again." },
          { status: 502 }
        ),
      };
    }
    if ((monthCount ?? 0) >= mLimit) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: `You've used all ${mLimit} document analyses on the ${PLAN_LABELS[snap.plan]} plan this month.${upgradeHint(snap.plan)}`,
            code: "plan_limit",
            plan: snap.plan,
            feature,
          },
          { status: 429 }
        ),
      };
    }

    const { count: hourCount, error: hErr } = await supabase
      .from("analysis_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", hourAgo);
    if (hErr) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "We couldn't check your plan usage. Please try again." },
          { status: 502 }
        ),
      };
    }
    if ((hourCount ?? 0) >= hLimit) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error:
              "You've reached the analysis limit for now. Try again in about an hour.",
            code: "hourly_limit",
            plan: snap.plan,
            feature,
          },
          { status: 429 }
        ),
      };
    }
    return { ok: true, plan: snap.plan };
  }

  const chatFeature = feature === "research" ? "research" : "chat";
  const { count: monthCount, error: mErr } = await supabase
    .from("chat_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", chatFeature)
    .gte("created_at", monthStart);
  if (mErr) {
    // Column may not exist until migration 0030 — fall back to unfiltered count.
    const { count: fallbackMonth, error: fbErr } = await supabase
      .from("chat_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart);
    if (fbErr) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "We couldn't check your plan usage. Please try again." },
          { status: 502 }
        ),
      };
    }
    if ((fallbackMonth ?? 0) >= mLimit) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: quotaMonthMessage(snap.plan, feature, mLimit),
            code: "plan_limit",
            plan: snap.plan,
            feature,
          },
          { status: 429 }
        ),
      };
    }
  } else if ((monthCount ?? 0) >= mLimit) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: quotaMonthMessage(snap.plan, feature, mLimit),
          code: "plan_limit",
          plan: snap.plan,
          feature,
        },
        { status: 429 }
      ),
    };
  }

  const { count: hourCount, error: hErr } = await supabase
    .from("chat_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", chatFeature)
    .gte("created_at", hourAgo);

  if (!hErr && (hourCount ?? 0) >= hLimit) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            feature === "research"
              ? "You've reached the Research limit for now. Try again in about an hour."
              : "You've reached the chat limit for now. Try again in about an hour.",
          code: "hourly_limit",
          plan: snap.plan,
          feature,
        },
        { status: 429 }
      ),
    };
  }

  if (hErr) {
    const { count: fbHour } = await supabase
      .from("chat_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", hourAgo);
    if ((fbHour ?? 0) >= hLimit) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error:
              "You've reached the chat limit for now. Try again in about an hour.",
            code: "hourly_limit",
            plan: snap.plan,
            feature,
          },
          { status: 429 }
        ),
      };
    }
  }

  return { ok: true, plan: snap.plan };
}

function quotaMonthMessage(
  plan: PlanId,
  feature: BillingFeature,
  limit: number
): string {
  const label =
    feature === "research"
      ? "Research briefs"
      : feature === "analyze"
        ? "document analyses"
        : "Ask Gideon / chat turns";
  return `You've used all ${limit} ${label} on the ${PLAN_LABELS[plan]} plan this month.${upgradeHint(plan)}`;
}

export async function recordChatEvent(
  supabase: SupabaseClient,
  userId: string,
  feature: "chat" | "research"
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("chat_events").insert({
    user_id: userId,
    feature,
  });
  if (!error) return { error: null };
  // Pre-migration fallback without feature column
  const { error: fb } = await supabase.from("chat_events").insert({
    user_id: userId,
  });
  return { error: fb?.message ?? error.message };
}

export async function getUsageCounts(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  analyze: number;
  chat: number;
  research: number;
  periodStart: string;
}> {
  const periodStart = billingMonthStartIso();
  const [a, c, r] = await Promise.all([
    supabase
      .from("analysis_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", periodStart),
    supabase
      .from("chat_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("feature", "chat")
      .gte("created_at", periodStart),
    supabase
      .from("chat_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("feature", "research")
      .gte("created_at", periodStart),
  ]);

  let chat = c.count ?? 0;
  let research = r.count ?? 0;
  if (c.error || r.error) {
    const { count } = await supabase
      .from("chat_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", periodStart);
    chat = count ?? 0;
    research = 0;
  }

  return {
    analyze: a.count ?? 0,
    chat,
    research,
    periodStart,
  };
}
