"use client";

import { useEffect } from "react";

/**
 * Fire-and-forget welcome email when the user lands in the app with a session
 * (e.g. email/password signup without email confirmation).
 */
export default function RetentionWelcomeTrigger() {
  useEffect(() => {
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
  }, []);

  return null;
}
