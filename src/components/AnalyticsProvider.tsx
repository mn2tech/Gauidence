"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  initAnalytics,
  isAnalyticsEnabled,
  trackButtonClick,
  trackPageView,
} from "@/lib/analytics";

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isAnalyticsEnabled()) return;

    const query = searchParams.toString();
    const url = query
      ? `${window.location.origin}${pathname}?${query}`
      : `${window.location.origin}${pathname}`;

    trackPageView(url);
  }, [pathname, searchParams]);

  return null;
}

export default function AnalyticsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!isAnalyticsEnabled()) return;

    let removeListener: (() => void) | undefined;

    void initAnalytics().then(() => {
      const onClick = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const tracked = target.closest<HTMLElement>("[data-analytics]");
        if (!tracked) return;

        const name = tracked.getAttribute("data-analytics")?.trim();
        if (!name) return;

        trackButtonClick(name, {
          path: window.location.pathname,
          tag: tracked.tagName.toLowerCase(),
        });
      };

      document.addEventListener("click", onClick, true);
      removeListener = () =>
        document.removeEventListener("click", onClick, true);
    });

    return () => {
      removeListener?.();
    };
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </>
  );
}
