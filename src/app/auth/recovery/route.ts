import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/supabase/config";

/**
 * Exchanges password-recovery codes from email links, sets session cookies,
 * then redirects to the update-password form.
 *
 * Allowlist in Supabase: https://your-domain.com/auth/recovery
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/login?error=not_configured`);
  }

  if (!code && !(tokenHash && type === "recovery")) {
    return NextResponse.redirect(`${origin}/login?error=provider_error`);
  }

  const response = NextResponse.redirect(`${origin}/auth/update-password`);
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
            /* ignore */
          }
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  if (tokenHash && type === "recovery") {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${
          /expired|invalid|otp/i.test(error.message)
            ? "reset_link_expired"
            : "exchange_failed"
        }`
      );
    }
    return response;
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${
          /expired|invalid|otp/i.test(error.message)
            ? "reset_link_expired"
            : "exchange_failed"
        }`
      );
    }
    return response;
  }

  return NextResponse.redirect(`${origin}/login?error=provider_error`);
}
