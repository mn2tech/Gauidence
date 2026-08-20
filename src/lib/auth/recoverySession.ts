"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

const RECOVERY_SESSION_ERROR =
  "This reset link is invalid or has expired. Request a new one and try again.";

function readHashParams(): URLSearchParams | null {
  if (typeof window === "undefined" || !window.location.hash) return null;
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

function clearAuthParamsFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("code");
  url.searchParams.delete("type");
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

/** Establish a password-recovery session from callback cookies, PKCE code, or hash tokens. */
export async function establishRecoverySession(
  supabase: SupabaseClient,
  codeFromQuery?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const code =
    codeFromQuery ??
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("code")
      : null);

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      clearAuthParamsFromUrl();
      return { ok: true };
    }
  }

  const hash = readHashParams();
  const accessToken = hash?.get("access_token");
  const refreshToken = hash?.get("refresh_token");
  const type = hash?.get("type");
  if (accessToken && refreshToken && type === "recovery") {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!error) {
      clearAuthParamsFromUrl();
      return { ok: true };
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return { ok: true };

  return { ok: false, error: RECOVERY_SESSION_ERROR };
}

export { RECOVERY_SESSION_ERROR };
