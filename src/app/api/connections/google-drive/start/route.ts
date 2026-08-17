import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  GDRIVE_OAUTH_PROFILE_COOKIE,
  GDRIVE_OAUTH_STATE_COOKIE,
  googleDriveAuthorizeUrl,
  googleDriveOAuthConfigured,
  newGoogleDriveOAuthState,
  oauthCookieOptions,
} from "@/lib/connectors/googleDrive/oauth";

export const runtime = "nodejs";

function connectionsRedirect(request: Request, query: Record<string, string>) {
  const url = new URL("/settings/connections", request.url);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  if (!googleDriveOAuthConfigured()) {
    return connectionsRedirect(request, { drive: "not_configured" });
  }

  const supabase = await createClient();
  if (!supabase) {
    return connectionsRedirect(request, { drive: "not_configured" });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", "/settings/connections");
    return NextResponse.redirect(login);
  }

  const incoming = new URL(request.url);
  const profileId = incoming.searchParams.get("profileId")?.trim() || "";
  const state = newGoogleDriveOAuthState();
  const authorize = googleDriveAuthorizeUrl({ request, state });
  const response = NextResponse.redirect(authorize);
  response.cookies.set(GDRIVE_OAUTH_STATE_COOKIE, state, oauthCookieOptions(600));
  if (profileId) {
    response.cookies.set(
      GDRIVE_OAUTH_PROFILE_COOKIE,
      profileId,
      oauthCookieOptions(600)
    );
  } else {
    response.cookies.set(GDRIVE_OAUTH_PROFILE_COOKIE, "", {
      ...oauthCookieOptions(0),
      maxAge: 0,
    });
  }
  return response;
}
