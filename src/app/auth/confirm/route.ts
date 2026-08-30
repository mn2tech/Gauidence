import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/supabase/config";

/**
 * Handles Supabase email links that use token_hash (recovery, signup, etc.).
 * Configure redirect URL: https://your-domain.com/auth/confirm
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/auth/update-password";

  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/auth/update-password";

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=provider_error`);
  }

  if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/login?error=not_configured`);
  }

  const redirectPath =
    type === "recovery" ? "/auth/update-password" : safeNext;
  const response = NextResponse.redirect(`${origin}${redirectPath}`);
  const cookieStore = await cookies();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            /* read-only in some contexts */
          }
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const otpType =
    type === "recovery"
      ? "recovery"
      : type === "signup"
        ? "signup"
        : type === "email"
          ? "email"
          : null;

  if (!otpType) {
    return NextResponse.redirect(`${origin}/login?error=provider_error`);
  }

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: otpType,
  });

  if (error) {
    const expired = /expired|invalid|otp/i.test(error.message);
    return NextResponse.redirect(
      `${origin}/login?error=${expired ? "reset_link_expired" : "exchange_failed"}`
    );
  }

  return response;
}
