/** Plan definitions and monthly quotas for Guardian billing. */

export const PLAN_IDS = ["free", "personal", "family", "business"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const PAID_PLAN_IDS = ["personal", "family", "business"] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];

export type PlanLimits = {
  analyzePerMonth: number;
  chatPerMonth: number;
  researchPerMonth: number;
  /** Soft hourly burst caps (anti-abuse), on top of monthly. */
  analyzePerHour: number;
  chatPerHour: number;
  researchPerHour: number;
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    analyzePerMonth: 5,
    chatPerMonth: 30,
    researchPerMonth: 3,
    analyzePerHour: 5,
    chatPerHour: 10,
    researchPerHour: 3,
  },
  personal: {
    analyzePerMonth: 100,
    chatPerMonth: 500,
    researchPerMonth: 50,
    analyzePerHour: 20,
    chatPerHour: 60,
    researchPerHour: 20,
  },
  family: {
    analyzePerMonth: 200,
    chatPerMonth: 1000,
    researchPerMonth: 100,
    analyzePerHour: 30,
    chatPerHour: 80,
    researchPerHour: 30,
  },
  business: {
    analyzePerMonth: 500,
    chatPerMonth: 3000,
    researchPerMonth: 300,
    analyzePerHour: 40,
    chatPerHour: 120,
    researchPerHour: 40,
  },
};

export const PLAN_LABELS: Record<PlanId, string> = {
  free: "Free",
  personal: "Personal",
  family: "Family",
  business: "Business",
};

export const PLAN_PRICE_DISPLAY: Record<PaidPlanId, string> = {
  personal: "$12/mo",
  family: "$24/mo",
  business: "$49/mo",
};

/** @deprecated use PLAN_PRICE_DISPLAY.personal */
export const PERSONAL_PRICE_DISPLAY = PLAN_PRICE_DISPLAY.personal;

export const PLAN_UNIT_AMOUNT_CENTS: Record<PaidPlanId, number> = {
  personal: 1200,
  family: 2400,
  business: 4900,
};

export const PLAN_PRODUCT_COPY: Record<
  PaidPlanId,
  { name: string; description: string }
> = {
  personal: {
    name: "Guardian Personal",
    description:
      "100 analyses, 500 Ask Gideon turns, and 50 Research briefs per month.",
  },
  family: {
    name: "Guardian Family",
    description:
      "200 analyses, 1,000 Ask Gideon turns, and 100 Research briefs per month — built for household vaults.",
  },
  business: {
    name: "Guardian Business",
    description:
      "500 analyses, 3,000 Ask Gideon turns, and 300 Research briefs per month — for teams and client work.",
  },
};

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v);
}

export function isPaidPlanId(v: unknown): v is PaidPlanId {
  return typeof v === "string" && (PAID_PLAN_IDS as readonly string[]).includes(v);
}

export function normalizePlan(v: unknown): PlanId {
  return isPlanId(v) ? v : "free";
}

export function parseCheckoutPlan(v: unknown): PaidPlanId | null {
  return isPaidPlanId(v) ? v : null;
}

/** Active Stripe subscription statuses that unlock a paid plan. */
export function isPaidSubscriptionStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "active" || s === "trialing";
}

export function planRank(plan: PlanId): number {
  switch (plan) {
    case "business":
      return 3;
    case "family":
      return 2;
    case "personal":
      return 1;
    default:
      return 0;
  }
}
