import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let initialized = false;

export function isAnalyticsEnabled(): boolean {
  return Boolean(POSTHOG_KEY?.trim());
}

export function initAnalytics(): void {
  if (!isAnalyticsEnabled() || initialized) return;
  initialized = true;

  posthog.init(POSTHOG_KEY!, {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: true,
  });
}

export function trackPageView(url: string): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture("$pageview", { $current_url: url });
}

export function trackEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null>
): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export function trackButtonClick(
  name: string,
  properties?: Record<string, string | number | boolean | null>
): void {
  trackEvent("button_click", { name, ...properties });
}
