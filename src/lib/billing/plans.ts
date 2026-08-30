/** Plan definitions and monthly quotas for Guardian billing. */

export const PLAN_IDS = ["free", "personal", "family", "business"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const PAID_PLAN_IDS = ["personal", "family", "business"] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];

/** Marketing alias: Guardian Pro maps to the personal paid plan. */
export const PRO_PLAN_ID: PaidPlanId = "personal";

export type PlanLimits = {
  analyzePerMonth: number;
  chatPerMonth: number;
  researchPerMonth: number;
  /** Soft hourly burst caps (anti-abuse), on top of monthly. */
  analyzePerHour: number;
  chatPerHour: number;
  researchPerHour: number;
  /** Total vault file storage for the account (bytes). */
  storageBytes: number;
  /** Max owned top-level Spaces (null / Infinity = unlimited). */
  spacesPerAccount: number;
  /** Max stored documents/items across the account. */
  documentsPerAccount: number;
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    analyzePerMonth: 10,
    chatPerMonth: 20,
    researchPerMonth: 3,
    analyzePerHour: 5,
    chatPerHour: 10,
    researchPerHour: 3,
    storageBytes: 1 * 1024 * 1024 * 1024,
    spacesPerAccount: 1,
    documentsPerAccount: 10,
  },
  personal: {
    analyzePerMonth: 100,
    chatPerMonth: 500,
    researchPerMonth: 50,
    analyzePerHour: 20,
    chatPerHour: 60,
    researchPerHour: 20,
    storageBytes: 10 * 1024 * 1024 * 1024,
    spacesPerAccount: 25,
    documentsPerAccount: 2_000,
  },
  family: {
    analyzePerMonth: 200,
    chatPerMonth: 1000,
    researchPerMonth: 100,
    analyzePerHour: 30,
    chatPerHour: 80,
    researchPerHour: 30,
    storageBytes: 25 * 1024 * 1024 * 1024,
    spacesPerAccount: 50,
    documentsPerAccount: 5_000,
  },
  business: {
    analyzePerMonth: 500,
    chatPerMonth: 3000,
    researchPerMonth: 300,
    analyzePerHour: 40,
    chatPerHour: 120,
    researchPerHour: 40,
    storageBytes: 50 * 1024 * 1024 * 1024,
    spacesPerAccount: 200,
    documentsPerAccount: 20_000,
  },
};

/** Central Free-tier limits — change here, not in UI components. */
export const FREE_PLAN_LIMITS = PLAN_LIMITS.free;

/** Central Pro (personal) limits — change here, not in UI components. */
export const PRO_PLAN_LIMITS = PLAN_LIMITS.personal;

export const PLAN_LABELS: Record<PlanId, string> = {
  free: "Guardian Free",
  personal: "Guardian Pro",
  family: "Guardian Family",
  business: "Guardian Business",
};

export const PLAN_PRICE_DISPLAY: Record<PaidPlanId, string> = {
  personal: "$9.99/mo",
  family: "$24/mo",
  business: "$49/mo",
};

/** Short marketing lines for /pricing and Settings. */
export const PLAN_TAGLINES: Record<PlanId, string> = {
  free: "Try Guardian with one Space and light monthly AI use.",
  personal:
    "Keep building knowledge — more Spaces, higher limits, and richer memory.",
  family: "Share one household Space — kids, school, pets, and home together.",
  business: "Clients, team tools, Leads, and higher volume for your firm.",
};

/** Plan-specific value bullets for pricing + upgrade modal (beyond quotas). */
export const PLAN_WEDGE_FEATURES: Record<PlanId, string[]> = {
  free: [
    "One Space to try Guardian",
    "Today’s priorities from your documents",
    "Ask Gideon grounded in your knowledge",
  ],
  personal: [
    "More Spaces for work and life",
    "Higher Ask Gideon & analysis limits",
    "Weekly Brief + Needs Attention alerts",
    "Referral credit when friends subscribe",
  ],
  family: [
    "Invite a spouse/partner to your Family Space",
    "Kids, school calendar (My School), pets & home",
    "Shared household memory in one place",
    "Higher limits for the whole household",
  ],
  business: [
    "Client Spaces + team Employee Hub",
    "Leads, Recruit, Proposals & Work Memory",
    "Business Pack intelligence in Ask Gideon",
    "Higher volume for firm workflows",
  ],
};

export const FREE_PRICE_DISPLAY = "$0";

/** @deprecated use PLAN_PRICE_DISPLAY.personal */
export const PERSONAL_PRICE_DISPLAY = PLAN_PRICE_DISPLAY.personal;

export const PLAN_UNIT_AMOUNT_CENTS: Record<PaidPlanId, number> = {
  personal: 999,
  family: 2400,
  business: 4900,
};

export const PLAN_PRODUCT_COPY: Record<
  PaidPlanId,
  { name: string; description: string }
> = {
  personal: {
    name: "Guardian Pro",
    description:
      "More Spaces, higher document and Gideon allowances, and advanced knowledge features.",
  },
  family: {
    name: "Guardian Family",
    description:
      "Shared household Space, My School, and higher limits for kids, pets, and home — 200 analyses and 1,000 Ask Gideon turns / month.",
  },
  business: {
    name: "Guardian Business",
    description:
      "Clients, Employee Hub, Leads, and firm workflows — 500 analyses and 3,000 Ask Gideon turns / month.",
  },
};

/** Feature flags gated behind paid plans (enforced server-side where practical). */
export const PRO_FEATURES = {
  unlimitedSpaces: true,
  advancedKnowledgeSearch: true,
  dailyBriefing: true,
  importantDateDetection: true,
  followUpDetection: true,
  crossDocumentKnowledge: true,
  enhancedMemory: true,
} as const;

export type SubscriptionStatus =
  | "free"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "unpaid"
  | "unknown";

export function normalizeSubscriptionStatus(
  status: string | null | undefined,
  plan?: PlanId
): SubscriptionStatus {
  if (!status) {
    return plan && plan !== "free" ? "active" : "free";
  }
  const s = status.toLowerCase();
  if (
    s === "trialing" ||
    s === "active" ||
    s === "past_due" ||
    s === "canceled" ||
    s === "incomplete" ||
    s === "unpaid"
  ) {
    return s;
  }
  if (s === "cancelled") return "canceled";
  return "unknown";
}

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
  if (v === "pro") return PRO_PLAN_ID;
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

export function isProPlan(plan: PlanId): boolean {
  return plan !== "free";
}
