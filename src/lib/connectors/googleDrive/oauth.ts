import "server-only";

export const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

export const GDRIVE_OAUTH_STATE_COOKIE = "gdrive_oauth_state";
export const GDRIVE_OAUTH_PROFILE_COOKIE = "gdrive_oauth_profile";

export function googleDriveClientId(): string {
  return (
    process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() ||
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    ""
  );
}

export function googleDriveClientSecret(): string {
  return (
    process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    ""
  );
}

export function googleDriveOAuthConfigured(): boolean {
  return Boolean(googleDriveClientId() && googleDriveClientSecret());
}

/** Redirect URI must match the browser origin Google sent the user from. */
export function googleDriveRedirectUri(request: Request): string {
  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    url.protocol.replace(":", "") ??
    "https";
  return `${proto}://${host}/api/connections/google-drive/callback`;
}

export function googleDriveAuthorizeUrl(args: {
  request: Request;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: googleDriveClientId(),
    redirect_uri: googleDriveRedirectUri(args.request),
    response_type: "code",
    scope: GOOGLE_DRIVE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: args.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function newGoogleDriveOAuthState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function oauthCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
