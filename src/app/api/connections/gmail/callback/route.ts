import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireEditableGuardianProfile } from "@/lib/profiles/server";
import {
  createConnectedSource,
  listConnectedSources,
  updateConnectedSource,
} from "@/lib/connectors/services/connectedSources";
import {
  GMAIL_OAUTH_PROFILE_COOKIE,
  GMAIL_OAUTH_RETURN_COOKIE,
  GMAIL_OAUTH_STATE_COOKIE,
  gmailOAuthConfigured,
  oauthCookieOptions,
} from "@/lib/connectors/gmail/oauth";
import {
  exchangeGmailCode,
  fetchGmailUser,
  GmailApiError,
  gmailTokensToSettings,
} from "@/lib/connectors/gmail/client";

export const runtime = "nodejs";

function redirectHome(
  request: Request,
  returnTo: string,
  query: Record<string, string>
) {
  const url = new URL(returnTo, request.url);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

function clearOauthCookies(response: NextResponse) {
  for (const name of [
    GMAIL_OAUTH_STATE_COOKIE,
    GMAIL_OAUTH_PROFILE_COOKIE,
    GMAIL_OAUTH_RETURN_COOKIE,
  ]) {
    response.cookies.set(name, "", { ...oauthCookieOptions(0), maxAge: 0 });
  }
}

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const code = incoming.searchParams.get("code");
  const state = incoming.searchParams.get("state");
  const providerError = incoming.searchParams.get("error");

  const cookieStore = await cookies();
  const returnRaw = cookieStore.get(GMAIL_OAUTH_RETURN_COOKIE)?.value?.trim();
  const returnTo =
    returnRaw && returnRaw.startsWith("/") && !returnRaw.startsWith("//")
      ? returnRaw
      : "/settings/connections";

  if (providerError) {
    const response = redirectHome(request, returnTo, {
      gmail: providerError === "access_denied" ? "denied" : "error",
    });
    clearOauthCookies(response);
    return response;
  }

  if (!gmailOAuthConfigured()) {
    return redirectHome(request, returnTo, { gmail: "not_configured" });
  }

  const expectedState = cookieStore.get(GMAIL_OAUTH_STATE_COOKIE)?.value;
  const profileId =
    cookieStore.get(GMAIL_OAUTH_PROFILE_COOKIE)?.value?.trim() || null;

  if (!code || !state || !expectedState || state !== expectedState) {
    const response = redirectHome(request, returnTo, { gmail: "error" });
    clearOauthCookies(response);
    return response;
  }

  const supabase = await createClient();
  if (!supabase) {
    return redirectHome(request, returnTo, { gmail: "not_configured" });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", returnTo);
    const response = NextResponse.redirect(login);
    clearOauthCookies(response);
    return response;
  }

  try {
    const tokens = await exchangeGmailCode(request, code);
    const account = await fetchGmailUser(tokens.accessToken);
    const settings = gmailTokensToSettings(tokens, {
      email: account.email,
      accountName: account.displayName,
      photoLink: account.photoLink ?? null,
    });
    const displayName = `Gmail (${account.email})`;
    const sourceUri = `https://mail.google.com/`;

    let boundProfileId: string | null = null;
    if (profileId) {
      const editable = await requireEditableGuardianProfile(
        supabase,
        user.id,
        profileId
      );
      boundProfileId = editable?.id ?? null;
    }

    const existing = await listConnectedSources(supabase, user.id);
    const prior = existing.find((s) => s.sourceType === "gmail");
    if (prior) {
      await updateConnectedSource(supabase, user.id, prior.id, {
        displayName,
        sourceUri,
        status: "connected",
        settings,
        profileId: boundProfileId ?? prior.profileId ?? null,
      });
    } else {
      await createConnectedSource(supabase, {
        userId: user.id,
        profileId: boundProfileId,
        sourceType: "gmail",
        displayName,
        sourceUri,
        settings,
      });
    }

    const response = redirectHome(request, returnTo, { gmail: "connected" });
    clearOauthCookies(response);
    return response;
  } catch (err) {
    console.error(
      "Gmail OAuth callback failed:",
      err instanceof Error ? err.message.slice(0, 200) : err
    );
    const response = redirectHome(request, returnTo, {
      gmail:
        err instanceof GmailApiError && err.status === 401 ? "denied" : "error",
    });
    clearOauthCookies(response);
    return response;
  }
}
