/**
 * Activation + subscription funnel events.
 * Dual-writes to PostHog (when configured) and durable product_events via API.
 */

import { trackEvent } from "@/lib/analytics";

export const FUNNEL_EVENT_NAMES = [
  "user_signed_up",
  "onboarding_started",
  "space_created",
  "first_item_added",
  "first_item_processed",
  "first_value_reached",
  "first_gideon_question",
  "upgrade_prompt_shown",
  "upgrade_clicked",
  "checkout_started",
  "subscription_started",
  "subscription_canceled",
  // Legacy onboarding names (kept for existing call sites)
  "intent_completed",
  "intent_skipped",
  "coach_completed",
  "sample_started",
  "first_document_uploaded",
  "first_win_shown",
  "first_gideon_ask",
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

/** @deprecated use FUNNEL_EVENT_NAMES */
export const ONBOARDING_EVENT_NAMES = FUNNEL_EVENT_NAMES;
export type OnboardingEventName = FunnelEventName;

export type OnboardingEventPayload = {
  intent?: string | null;
  profileKind?: string | null;
  source?: string | null;
  plan?: string | null;
  step?: string | null;
  [key: string]: string | number | boolean | null | undefined;
};

function toAnalyticsProps(
  payload: OnboardingEventPayload
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

/** Fire a funnel event to PostHog + internal product_events. */
export function trackOnboardingEvent(
  name: FunnelEventName | string,
  payload: OnboardingEventPayload = {}
): void {
  if (typeof window === "undefined") return;

  trackEvent(name, toAnalyticsProps(payload));

  try {
    window.dispatchEvent(
      new CustomEvent("guardian:onboarding", {
        detail: { name, ...payload, at: new Date().toISOString() },
      })
    );
  } catch {
    /* ignore */
  }

  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: name, properties: payload }),
    keepalive: true,
  }).catch(() => {
    /* non-fatal */
  });
}

export function trackFunnelEvent(
  name: FunnelEventName,
  payload: OnboardingEventPayload = {}
): void {
  trackOnboardingEvent(name, payload);
}
