"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActiveProfile } from "@/components/ProfileProvider";
import type { OnboardingProgress } from "@/lib/help/onboarding";

const EMPTY: OnboardingProgress = {
  hasVault: false,
  hasDocument: false,
  hasDailyLog: false,
  hasAskedGideon: false,
};

async function exists(
  table: "documents" | "daily_logs" | "vault_chats"
): Promise<boolean> {
  const supabase = createClient();
  if (!supabase) return false;
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .limit(1);
  if (error) return false;
  return (count ?? 0) > 0;
}

/**
 * Live getting-started progress from profiles + vault activity.
 */
export function useOnboardingProgress() {
  const { profiles, loading: profilesLoading } = useActiveProfile();
  const [progress, setProgress] = useState<OnboardingProgress>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const hasVault = profiles.length > 0;
    if (!hasVault) {
      setProgress(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [hasDocument, hasDailyLog, hasAskedGideon] = await Promise.all([
        exists("documents"),
        exists("daily_logs"),
        exists("vault_chats"),
      ]);
      setProgress({
        hasVault: true,
        hasDocument,
        hasDailyLog,
        hasAskedGideon,
      });
    } finally {
      setLoading(false);
    }
  }, [profiles.length]);

  useEffect(() => {
    if (profilesLoading) return;
    void refresh();
  }, [profilesLoading, refresh]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("guardian:profile-changed", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("guardian:profile-changed", onFocus);
    };
  }, [refresh]);

  return { progress, loading: profilesLoading || loading, refresh };
}
