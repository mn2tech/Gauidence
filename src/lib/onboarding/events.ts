/**
 * Lightweight onboarding funnel events for future analytics wiring.
 */

export const ONBOARDING_EVENT_NAMES = [
  "intent_completed",
  "intent_skipped",
  "sample_started",
  "first_document_uploaded",
  "first_win_shown",
  "first_gideon_ask",
] as const;

export type OnboardingEventName = (typeof ONBOARDING_EVENT_NAMES)[number];

export type OnboardingEventPayload = {
  intent?: string | null;
  profileKind?: string | null;
  source?: string | null;
};

/** Fire a funnel event (no-op until an analytics provider is connected). */
export function trackOnboardingEvent(
  name: OnboardingEventName,
  payload: OnboardingEventPayload = {}
): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("guardian:onboarding", {
        detail: { name, ...payload, at: new Date().toISOString() },
      })
    );
  } catch {
    /* ignore */
  }
}
