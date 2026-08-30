import { isProPlan, normalizePlan } from "@/lib/billing/plans";

/**
 * Outbound digests (due-soon, Needs Attention, Weekly Brief, deadline emails)
 * require a paid plan. Free keeps Today + Ask in-app with quotas.
 */
export function planAllowsOutboundDigests(plan: unknown): boolean {
  return isProPlan(normalizePlan(plan));
}
