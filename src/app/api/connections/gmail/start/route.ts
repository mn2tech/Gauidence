import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  GMAIL_OAUTH_PROFILE_COOKIE,
  GMAIL_OAUTH_RETURN_COOKIE,
  GMAIL_OAUTH_STATE_COOKIE,
  gmailAuthorizeUrl,
  gmailOAuthConfigured,
  newGmailOAuthState,
  oauthCookieOptions,
} from "@/lib/connectors/gmail/oauth";

export const runtime = "nodejs";

function redirectWithQuery(
  request: Request,
  path: string,
  query: Record<string, string>
) {
  const url = new URL(path, request.url);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const returnTo =
    new URL(request.url).searchParams.get("returnTo")?.trim() ||
    "/settings/connections";
  const safeReturn =
    returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/settings/connections";

  if (!gmailOAuthConfigured()) {
    return redirectWithQuery(request, safeReturn, { gmail: "not_configured" });
  }

  const supabase = await createClient();
  if (!supabase) {
    return redirectWithQuery(request, safeReturn, { gmail: "not_configured" });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", safeReturn);
    return NextResponse.redirect(login);
  }

  const profileId =
    new URL(request.url).searchParams.get("profileId")?.trim() || "";
  const state = newGmailOAuthState();
  const authorize = gmailAuthorizeUrl({ request, state });
  const response = NextResponse.redirect(authorize);
  response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, state, oauthCookieOptions(600));
  response.cookies.set(
    GMAIL_OAUTH_RETURN_COOKIE,
    safeReturn,
    oauthCookieOptions(600)
  );
  if (profileId) {
    response.cookies.set(
      GMAIL_OAUTH_PROFILE_COOKIE,
      profileId,
      oauthCookieOptions(600)
    );
  } else {
    response.cookies.set(GMAIL_OAUTH_PROFILE_COOKIE, "", {
      ...oauthCookieOptions(0),
      maxAge: 0,
    });
  }
  return response;
}
