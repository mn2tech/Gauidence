import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/supabase/config";
import { ensureDefaultGuardianProfile, getActiveGuardianProfile } from "@/lib/profiles/server";
import { signedInLandingPath } from "@/lib/simple-home/routing";

function redirectWithSessionCookies(
  url: string,
  sessionResponse: NextResponse
): NextResponse {
  const redirect = NextResponse.redirect(url);
  sessionResponse.cookies.getAll().forEach(({ name, value }) => {
    redirect.cookies.set(name, value);
  });
  return redirect;
}

/**
 * OAuth / email-confirmation / password-recovery callback.
 * Exchanges the auth code for a session, ensures a profile row exists
 * (without overwriting user edits), then redirects to the requested page.
 *
 * Important: session cookies from exchangeCodeForSession must be written
 * onto the redirect NextResponse. Next.js does not propagate cookies().set()
 * onto a separately constructed redirect response.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const explicitNext = searchParams.get("next");
  const signupRef = searchParams.get("ref")?.trim() || null;
  const legalAccepted = searchParams.get("legal") === "1";
  const termsVersion = searchParams.get("tv")?.trim() || null;
  const privacyVersion = searchParams.get("pv")?.trim() || null;
  const safeNext =
    explicitNext &&
    explicitNext.startsWith("/") &&
    !explicitNext.startsWith("//")
      ? explicitNext
      : "/ask";

  const providerError = searchParams.get("error");
  const errorCode = searchParams.get("error_code");
  if (providerError) {
    if (errorCode === "otp_expired") {
      return NextResponse.redirect(
        `${origin}/login?error=reset_link_expired`
      );
    }
    const reason =
      providerError === "access_denied" ? "access_denied" : "provider_error";
    return NextResponse.redirect(`${origin}/login?error=${reason}`);
  }

  if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/login?error=not_configured`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=provider_error`);
  }

  // Build redirect first so Set-Cookie lands on the response the browser receives.
  let redirectPath = safeNext;
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
            // Request-scope store can be read-only in some contexts.
          }
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error(
      "Auth callback exchange failed:",
      error.message?.slice(0, 200)
    );
    const expired = /expired|invalid|otp/i.test(error.message);
    return NextResponse.redirect(
      `${origin}/login?error=${expired ? "reset_link_expired" : "exchange_failed"}`
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const meta = user.user_metadata ?? {};
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email,
        full_name: meta.full_name ?? meta.name ?? null,
        avatar_url: meta.avatar_url ?? meta.picture ?? null,
      },
      { onConflict: "id", ignoreDuplicates: true }
    );
    await ensureDefaultGuardianProfile(supabase, user);
    if (legalAccepted) {
      const { LEGAL_VERSIONS } = await import("@/lib/legal/versions");
      const now = new Date().toISOString();
      await supabase
        .from("profiles")
        .update({
          terms_accepted_at: now,
          terms_version: termsVersion || LEGAL_VERSIONS.terms,
          privacy_acknowledged_at: now,
          privacy_version: privacyVersion || LEGAL_VERSIONS.privacy,
          updated_at: now,
        })
        .eq("id", user.id);
    }
    if (
      signupRef &&
      typeof user.user_metadata?.signup_ref !== "string"
    ) {
      await supabase.auth.updateUser({ data: { signup_ref: signupRef } });
    }
    if (!explicitNext) {
      const active = await getActiveGuardianProfile(supabase, user);
      redirectPath = signedInLandingPath(active, { email: user.email });
    }
    void import("@/lib/retention/run").then(({ trySendWelcomeEmail }) =>
      trySendWelcomeEmail(user.id).catch((err) => {
        console.error(
          "Welcome email failed:",
          err instanceof Error ? err.message : "error"
        );
      })
    );
  }

  if (redirectPath !== safeNext) {
    return redirectWithSessionCookies(`${origin}${redirectPath}`, response);
  }

  return response;
}
