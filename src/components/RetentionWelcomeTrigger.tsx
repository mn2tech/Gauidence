"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Fire-and-forget welcome email when a signed-in user lands in the app
 * (e.g. email/password signup without email confirmation).
 */
export default function RetentionWelcomeTrigger() {
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    let cancelled = false;

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session) return;

      const key = "guardian:welcome-email-requested";
      try {
        if (sessionStorage.getItem(key) === "1") return;
        sessionStorage.setItem(key, "1");
      } catch {
        /* private mode */
      }

      void fetch("/api/retention/welcome", { method: "POST" }).catch(() => {
        /* ignore */
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
