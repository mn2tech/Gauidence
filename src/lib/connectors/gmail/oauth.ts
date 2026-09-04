import "server-only";

import {
  googleDriveClientId,
  googleDriveClientSecret,
  oauthCookieOptions,
} from "@/lib/connectors/googleDrive/oauth";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

export const GMAIL_OAUTH_STATE_COOKIE = "gmail_oauth_state";
export const GMAIL_OAUTH_PROFILE_COOKIE = "gmail_oauth_profile";
export const GMAIL_OAUTH_RETURN_COOKIE = "gmail_oauth_return";

export function gmailOAuthConfigured(): boolean {
  return Boolean(googleDriveClientId() && googleDriveClientSecret());
}

export function gmailRedirectUri(request: Request): string {
  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    url.protocol.replace(":", "") ??
    "https";
  return `${proto}://${host}/api/connections/gmail/callback`;
}

export function gmailAuthorizeUrl(args: {
  request: Request;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: googleDriveClientId(),
    redirect_uri: gmailRedirectUri(args.request),
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: args.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function newGmailOAuthState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export { googleDriveClientId as gmailClientId };
export { googleDriveClientSecret as gmailClientSecret };
export { oauthCookieOptions };
