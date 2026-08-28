"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export const RECOVERY_SESSION_ERROR =
  "This reset link is invalid or has expired. Request a new one and try again.";

function readHashParams(): URLSearchParams | null {
  if (typeof window === "undefined" || !window.location.hash) return null;
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

function readSearchParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function clearAuthParamsFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("code");
  url.searchParams.delete("type");
  url.searchParams.delete("token_hash");
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

/** Establish a password-recovery session from callback cookies, PKCE code, or hash tokens. */
export async function establishRecoverySession(
  supabase: SupabaseClient,
  codeFromQuery?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const search = readSearchParams();
  const code = codeFromQuery ?? search.get("code");

  const tokenHash = search.get("token_hash");
  const type = search.get("type");
  if (tokenHash && type === "recovery") {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });
    if (!error) {
      clearAuthParamsFromUrl();
      return { ok: true };
    }
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      clearAuthParamsFromUrl();
      return { ok: true };
    }
    if (/expired|invalid|otp/i.test(error.message)) {
      return { ok: false, error: RECOVERY_SESSION_ERROR };
    }
  }

  const hash = readHashParams();
  const accessToken = hash?.get("access_token");
  const refreshToken = hash?.get("refresh_token");
  const hashType = hash?.get("type");
  if (accessToken && refreshToken && hashType === "recovery") {
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
