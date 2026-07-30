"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useActiveProfile } from "@/components/ProfileProvider";
import OnboardingIntentScreen from "@/components/OnboardingIntentScreen";
import { postLoginPathForProfile } from "@/lib/employee-hub/routing";

/** Public / auth paths where the intent gate must not block. */
const SKIP_PATH_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/auth",
  "/invite",
  "/pricing",
  "/security",
];

function shouldSkipPath(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname === "/") return true;
  return SKIP_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/**
 * Soft gate: signed-in users who haven't finished intent see the screen
 * instead of the app (except public, auth, and invite routes).
 */
export default function OnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading: profilesLoading, refresh, switchProfile } = useActiveProfile();
  const [checking, setChecking] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const skipPath = shouldSkipPath(pathname);

  const checkStatus = useCallback(async () => {
    if (skipPath) {
      setChecking(false);
      setNeedsOnboarding(false);
      return;
    }
    if (profilesLoading) return;

    try {
      const res = await fetch("/api/account/onboarding");
      if (res.status === 401) {
        setSignedIn(false);
        setNeedsOnboarding(false);
        return;
      }
      setSignedIn(true);
      if (res.status === 503) {
        // Migration not applied — don't block the app.
        setNeedsOnboarding(false);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        needsOnboarding?: boolean;
      };
      setNeedsOnboarding(Boolean(body.needsOnboarding));
    } catch {
      setNeedsOnboarding(false);
    } finally {
      setChecking(false);
    }
  }, [profilesLoading, skipPath]);

  useEffect(() => {
    setChecking(true);
    void checkStatus();
  }, [checkStatus]);

  if (skipPath) return <>{children}</>;

  if (profilesLoading || checking) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-ink-muted">
        Loading…
      </div>
    );
  }

  if (signedIn && needsOnboarding) {
    return (
      <OnboardingIntentScreen
        onComplete={async ({ activeProfileId }) => {
          setNeedsOnboarding(false);
          await refresh();
          if (activeProfileId) {
            await switchProfile(activeProfileId);
          }
          let landing = "/ask";
          try {
            const res = await fetch("/api/profiles");
            const body = (await res.json().catch(() => ({}))) as {
              active?: { profile_type: string; parent_profile_id: string | null };
            };
            if (res.ok && body.active) {
              landing = postLoginPathForProfile(body.active);
            }
          } catch {
            // Keep default /ask.
          }
          if (pathname !== landing) {
            router.replace(landing);
          } else {
            router.refresh();
          }
        }}
      />
    );
  }

  return <>{children}</>;
}
