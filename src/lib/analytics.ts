import type { PostHog } from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let client: PostHog | null = null;
let initPromise: Promise<void> | null = null;

export function isAnalyticsEnabled(): boolean {
  return Boolean(POSTHOG_KEY?.trim());
}

export function initAnalytics(): Promise<void> {
  if (!isAnalyticsEnabled()) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = import("posthog-js").then((mod) => {
    client = mod.default;
    client.init(POSTHOG_KEY!, {
      api_host: POSTHOG_HOST,
      person_profiles: "identified_only",
      capture_pageview: false,
      capture_pageleave: true,
    });
  });

  return initPromise;
}

export function trackPageView(url: string): void {
  if (!isAnalyticsEnabled()) return;
  void initAnalytics().then(() => {
    client?.capture("$pageview", { $current_url: url });
  });
}

export function trackEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null>
): void {
  if (!isAnalyticsEnabled()) return;
  void initAnalytics().then(() => {
    client?.capture(event, properties);
  });
}

export function trackButtonClick(
  name: string,
  properties?: Record<string, string | number | boolean | null>
): void {
  trackEvent("button_click", { name, ...properties });
}
