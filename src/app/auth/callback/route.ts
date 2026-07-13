import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth / email-confirmation callback.
 * Exchanges the auth code for a session, makes sure a profile row exists
 * (without overwriting user edits), then redirects to the requested page.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/ask";
  // Only allow same-site relative redirects.
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/ask";

  // Provider returned an error (e.g. the user canceled the Google consent screen).
  const providerError = searchParams.get("error");
  if (providerError) {
    const reason = providerError === "access_denied" ? "access_denied" : "provider_error";
    return NextResponse.redirect(`${origin}/login?error=${reason}`);
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/login?error=not_configured`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=provider_error`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  // Safety net alongside the DB trigger: create the profile if it doesn't
  // exist yet. ignoreDuplicates keeps us from overwriting user-edited values
  // on subsequent logins.
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
    try {
      const { ensureDefaultGuardianProfile } = await import(
        "@/lib/profiles/server"
      );
      await ensureDefaultGuardianProfile(supabase, user);
    } catch {
      // Non-fatal: pages/APIs also ensure a default profile.
    }
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
