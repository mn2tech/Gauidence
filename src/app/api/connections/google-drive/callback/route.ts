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
  GDRIVE_OAUTH_PROFILE_COOKIE,
  GDRIVE_OAUTH_STATE_COOKIE,
  googleDriveOAuthConfigured,
  oauthCookieOptions,
} from "@/lib/connectors/googleDrive/oauth";
import {
  exchangeGoogleDriveCode,
  fetchGoogleDriveUser,
  GoogleDriveApiError,
  tokensToSettings,
} from "@/lib/connectors/googleDrive/client";

export const runtime = "nodejs";

function connectionsRedirect(request: Request, query: Record<string, string>) {
  const url = new URL("/settings/connections", request.url);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

function clearOauthCookies(response: NextResponse) {
  response.cookies.set(GDRIVE_OAUTH_STATE_COOKIE, "", {
    ...oauthCookieOptions(0),
    maxAge: 0,
  });
  response.cookies.set(GDRIVE_OAUTH_PROFILE_COOKIE, "", {
    ...oauthCookieOptions(0),
    maxAge: 0,
  });
}

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const code = incoming.searchParams.get("code");
  const state = incoming.searchParams.get("state");
  const providerError = incoming.searchParams.get("error");

  if (providerError) {
    const response = connectionsRedirect(request, {
      drive: providerError === "access_denied" ? "denied" : "error",
    });
    clearOauthCookies(response);
    return response;
  }

  if (!googleDriveOAuthConfigured()) {
    return connectionsRedirect(request, { drive: "not_configured" });
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GDRIVE_OAUTH_STATE_COOKIE)?.value;
  const profileId = cookieStore.get(GDRIVE_OAUTH_PROFILE_COOKIE)?.value?.trim() || null;

  if (!code || !state || !expectedState || state !== expectedState) {
    const response = connectionsRedirect(request, { drive: "error" });
    clearOauthCookies(response);
    return response;
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
    const response = NextResponse.redirect(login);
    clearOauthCookies(response);
    return response;
  }

  try {
    const tokens = await exchangeGoogleDriveCode(request, code);
    const account = await fetchGoogleDriveUser(tokens.accessToken);
    const settings = tokensToSettings(tokens, {
      email: account.email,
      accountName: account.displayName,
      photoLink: account.photoLink ?? null,
    });
    const displayName = `Google Drive (${account.email})`;
    const sourceUri = `https://drive.google.com/drive/my-drive`;

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
    const prior = existing.find((s) => s.sourceType === "google_drive");
    if (prior) {
      await updateConnectedSource(supabase, user.id, prior.id, {
        displayName,
        sourceUri,
        status: "connected",
        settings: {
          ...settings,
          folderId: prior.settings.folderId ?? null,
          folderName: prior.settings.folderName ?? null,
          driveId: prior.settings.driveId ?? null,
          folderKind: prior.settings.folderKind ?? null,
        },
        profileId: boundProfileId ?? prior.profileId ?? null,
      });
    } else {
      await createConnectedSource(supabase, {
        userId: user.id,
        profileId: boundProfileId,
        sourceType: "google_drive",
        displayName,
        sourceUri,
        settings,
      });
    }

    const response = connectionsRedirect(request, { drive: "connected" });
    clearOauthCookies(response);
    return response;
  } catch (err) {
    console.error(
      "Google Drive OAuth callback failed:",
      err instanceof Error ? err.message.slice(0, 200) : err
    );
    const response = connectionsRedirect(request, {
      drive: err instanceof GoogleDriveApiError && err.status === 401
        ? "denied"
        : "error",
    });
    clearOauthCookies(response);
    return response;
  }
}
