/** Plan definitions and monthly quotas for Guardian billing. */

export const PLAN_IDS = ["free", "personal"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

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
};

export const PLAN_LABELS: Record<PlanId, string> = {
  free: "Free",
  personal: "Personal",
};

export const PERSONAL_PRICE_DISPLAY = "$12/mo";

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v);
}

export function normalizePlan(v: unknown): PlanId {
  return isPlanId(v) ? v : "free";
}

/** Active Stripe subscription statuses that unlock Personal. */
export function isPaidSubscriptionStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "active" || s === "trialing";
}
