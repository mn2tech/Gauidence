import "server-only";

import {
  gmailClientId,
  gmailClientSecret,
  gmailRedirectUri,
} from "./oauth";
import {
  headerValue,
  parseEmailDate,
  parseFromHeader,
} from "./parse";

export { parseFromHeader } from "./parse";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export type GmailTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  tokenType?: string;
  scope?: string;
};

export type GmailUser = {
  email: string;
  displayName: string;
  photoLink?: string | null;
};

export type GmailMessageMeta = {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  receivedAt: string | null;
  historyId?: string;
};

export class GmailApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GmailApiError";
    this.status = status;
  }
}

export function getGmailTokens(
  settings?: Record<string, unknown> | null
): GmailTokens | null {
  const accessToken = String(settings?.accessToken ?? "").trim();
  const refreshToken = String(settings?.refreshToken ?? "").trim();
  const expiresAt = String(settings?.expiresAt ?? "").trim();
  if (!refreshToken) return null;
  return {
    accessToken,
    refreshToken,
    expiresAt: expiresAt || new Date(0).toISOString(),
    tokenType: String(settings?.tokenType ?? "Bearer"),
    scope: String(settings?.scope ?? ""),
  };
}

export function gmailTokensToSettings(
  tokens: GmailTokens,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...(extra ?? {}),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    tokenType: tokens.tokenType ?? "Bearer",
    scope: tokens.scope ?? "",
  };
}

function expiresAtFromSeconds(expiresIn: number): string {
  const skewMs = 60_000;
  return new Date(
    Date.now() + Math.max(30, expiresIn) * 1000 - skewMs
  ).toISOString();
}

export async function exchangeGmailCode(
  request: Request,
  code: string
): Promise<GmailTokens> {
  const body = new URLSearchParams({
    code,
    client_id: gmailClientId(),
    client_secret: gmailClientSecret(),
    redirect_uri: gmailRedirectUri(request),
    grant_type: "authorization_code",
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new GmailApiError(
      res.status || 400,
      json.error_description ||
        json.error ||
        "Couldn't exchange Google authorization code."
    );
  }
  if (!json.refresh_token) {
    throw new GmailApiError(
      400,
      "Google did not return a refresh token. Reconnect and grant Gmail access again."
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: expiresAtFromSeconds(Number(json.expires_in ?? 3600)),
    tokenType: json.token_type,
    scope: json.scope,
  };
}

export async function refreshGmailTokens(
  tokens: GmailTokens
): Promise<GmailTokens> {
  const body = new URLSearchParams({
    client_id: gmailClientId(),
    client_secret: gmailClientSecret(),
    refresh_token: tokens.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new GmailApiError(
      res.status === 400 || res.status === 401 ? 401 : res.status,
      json.error_description ||
        json.error ||
        "Gmail access expired. Reconnect."
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: tokens.refreshToken,
    expiresAt: expiresAtFromSeconds(Number(json.expires_in ?? 3600)),
    tokenType: json.token_type ?? tokens.tokenType,
    scope: json.scope ?? tokens.scope,
  };
}

function accessTokenExpired(tokens: GmailTokens): boolean {
  const at = Date.parse(tokens.expiresAt);
  if (!Number.isFinite(at)) return true;
  return at <= Date.now();
}

export async function ensureGmailTokens(
  tokens: GmailTokens
): Promise<{ tokens: GmailTokens; rotated: boolean }> {
  if (tokens.accessToken && !accessTokenExpired(tokens)) {
    return { tokens, rotated: false };
  }
  const next = await refreshGmailTokens(tokens);
  return { tokens: next, rotated: true };
}

export async function fetchGmailUser(
  accessToken: string
): Promise<GmailUser> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
    picture?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new GmailApiError(
      res.status,
      json.error?.message || "Couldn't load Google account."
    );
  }
  const email = json.email?.trim() || "gmail";
  return {
    email,
    displayName: json.name?.trim() || email,
    photoLink: json.picture ?? null,
  };
}

async function gmailJson<T>(
  accessToken: string,
  path: string,
  query?: Record<string, string>
): Promise<T> {
  const params = new URLSearchParams(query);
  const url = `${GMAIL_API}${path}${params.size ? `?${params.toString()}` : ""}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GmailApiError(
      res.status,
      text.slice(0, 240) || `Gmail API error (${res.status})`
    );
  }
  return (await res.json()) as T;
}

export async function listGmailMessageIds(
  accessToken: string,
  args?: { maxResults?: number; q?: string }
): Promise<Array<{ id: string; threadId: string }>> {
  const json = await gmailJson<{
    messages?: Array<{ id?: string; threadId?: string }>;
  }>(accessToken, "/users/me/messages", {
    maxResults: String(args?.maxResults ?? 40),
    q: args?.q ?? "newer_than:30d",
  });
  return (json.messages ?? [])
    .filter((m): m is { id: string; threadId: string } => Boolean(m.id))
    .map((m) => ({ id: m.id, threadId: m.threadId || m.id }));
}

/** Fetch message metadata with From/Subject/Date headers. */
export async function fetchGmailMessageMeta(
  accessToken: string,
  messageId: string
): Promise<GmailMessageMeta> {
  const params = new URLSearchParams({ format: "metadata" });
  params.append("metadataHeaders", "From");
  params.append("metadataHeaders", "Subject");
  params.append("metadataHeaders", "Date");
  const url = `${GMAIL_API}/users/me/messages/${encodeURIComponent(messageId)}?${params}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GmailApiError(
      res.status,
      text.slice(0, 240) || `Gmail API error (${res.status})`
    );
  }
  const json = (await res.json()) as {
    id?: string;
    threadId?: string;
    labelIds?: string[];
    snippet?: string;
    historyId?: string;
    payload?: { headers?: Array<{ name?: string; value?: string }> };
  };
  const headers = json.payload?.headers ?? [];
  const from = parseFromHeader(headerValue(headers, "From"));
  return {
    id: json.id || messageId,
    threadId: json.threadId || messageId,
    labelIds: json.labelIds ?? [],
    snippet: (json.snippet ?? "").trim(),
    fromName: from.fromName,
    fromEmail: from.fromEmail,
    subject: headerValue(headers, "Subject") || "(no subject)",
    receivedAt: parseEmailDate(headerValue(headers, "Date")),
    historyId: json.historyId,
  };
}
