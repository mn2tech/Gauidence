import "server-only";

import {
  googleDriveClientId,
  googleDriveClientSecret,
  googleDriveRedirectUri,
} from "./oauth";
import {
  GOOGLE_FOLDER_MIME,
  GOOGLE_SHORTCUT_MIME,
  googleDriveExportMime,
  isGoogleDriveExportableMime,
} from "./mimes";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export type GoogleDriveTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  tokenType?: string;
  scope?: string;
};

export type GoogleDriveUser = {
  email: string;
  displayName: string;
  photoLink?: string | null;
};

export type GoogleDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
};

export type GoogleDriveLocation = {
  id: string;
  name: string;
  kind: "my_drive" | "shared_drive" | "folder";
  driveId?: string | null;
};

export class GoogleDriveApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GoogleDriveApiError";
    this.status = status;
  }
}

export function getGoogleDriveTokens(
  settings?: Record<string, unknown> | null
): GoogleDriveTokens | null {
  const accessToken = String(settings?.accessToken ?? "").trim();
  const refreshToken = String(settings?.refreshToken ?? "").trim();
  const expiresAt = String(settings?.expiresAt ?? "").trim();
  if (!accessToken && !refreshToken) return null;
  if (!refreshToken) return null;
  return {
    accessToken,
    refreshToken,
    expiresAt: expiresAt || new Date(0).toISOString(),
    tokenType: String(settings?.tokenType ?? "Bearer"),
    scope: String(settings?.scope ?? ""),
  };
}

export function tokensToSettings(
  tokens: GoogleDriveTokens,
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
  return new Date(Date.now() + Math.max(30, expiresIn) * 1000 - skewMs).toISOString();
}

export async function exchangeGoogleDriveCode(
  request: Request,
  code: string
): Promise<GoogleDriveTokens> {
  const body = new URLSearchParams({
    code,
    client_id: googleDriveClientId(),
    client_secret: googleDriveClientSecret(),
    redirect_uri: googleDriveRedirectUri(request),
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
    throw new GoogleDriveApiError(
      res.status || 400,
      json.error_description || json.error || "Couldn't exchange Google authorization code."
    );
  }
  if (!json.refresh_token) {
    throw new GoogleDriveApiError(
      400,
      "Google did not return a refresh token. Reconnect and grant Drive access again."
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

export async function refreshGoogleDriveTokens(
  tokens: GoogleDriveTokens
): Promise<GoogleDriveTokens> {
  const body = new URLSearchParams({
    client_id: googleDriveClientId(),
    client_secret: googleDriveClientSecret(),
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
    throw new GoogleDriveApiError(
      res.status === 400 || res.status === 401 ? 401 : res.status,
      json.error_description || json.error || "Google Drive access expired. Reconnect."
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

export function accessTokenExpired(tokens: GoogleDriveTokens): boolean {
  const at = Date.parse(tokens.expiresAt);
  if (!Number.isFinite(at)) return true;
  return at <= Date.now();
}

export async function ensureGoogleDriveTokens(
  tokens: GoogleDriveTokens
): Promise<{ tokens: GoogleDriveTokens; rotated: boolean }> {
  if (tokens.accessToken && !accessTokenExpired(tokens)) {
    return { tokens, rotated: false };
  }
  const next = await refreshGoogleDriveTokens(tokens);
  return { tokens: next, rotated: true };
}

async function driveFetch(
  accessToken: string,
  path: string,
  query?: Record<string, string>
): Promise<Response> {
  const params = new URLSearchParams(query);
  const url = `${DRIVE_API}${path}${params.size ? `?${params.toString()}` : ""}`;
  return fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
}

async function driveJson<T>(
  accessToken: string,
  path: string,
  query?: Record<string, string>
): Promise<T> {
  const res = await driveFetch(accessToken, path, query);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GoogleDriveApiError(
      res.status,
      text.slice(0, 240) || `Google Drive API error (${res.status})`
    );
  }
  return (await res.json()) as T;
}

export async function fetchGoogleDriveUser(
  accessToken: string
): Promise<GoogleDriveUser> {
  const about = await driveJson<{
    user?: { emailAddress?: string; displayName?: string; photoLink?: string };
  }>(accessToken, "/about", { fields: "user(emailAddress,displayName,photoLink)" });
  const email = about.user?.emailAddress?.trim() || "google-drive";
  return {
    email,
    displayName: about.user?.displayName?.trim() || email,
    photoLink: about.user?.photoLink ?? null,
  };
}

export async function listSharedDrives(
  accessToken: string
): Promise<Array<{ id: string; name: string }>> {
  const drives: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;
  do {
    const page = await driveJson<{
      drives?: Array<{ id?: string; name?: string }>;
      nextPageToken?: string;
    }>(accessToken, "/drives", {
      pageSize: "50",
      fields: "nextPageToken,drives(id,name)",
      ...(pageToken ? { pageToken } : {}),
    });
    for (const drive of page.drives ?? []) {
      if (drive.id) {
        drives.push({ id: drive.id, name: drive.name?.trim() || "Shared drive" });
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken && drives.length < 100);
  return drives;
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function listChildrenPage(
  accessToken: string,
  args: {
    parentId: string;
    driveId?: string | null;
    foldersOnly?: boolean;
    pageToken?: string;
  }
): Promise<{ files: GoogleDriveFile[]; nextPageToken?: string }> {
  const parent = escapeDriveQueryValue(args.parentId);
  let q = `'${parent}' in parents and trashed = false`;
  if (args.foldersOnly) {
    q += ` and mimeType = '${GOOGLE_FOLDER_MIME}'`;
  }
  const query: Record<string, string> = {
    q,
    pageSize: "100",
    fields:
      "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,parents)",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    orderBy: "folder,name",
  };
  if (args.driveId) {
    query.corpora = "drive";
    query.driveId = args.driveId;
  } else {
    query.corpora = "user";
  }
  if (args.pageToken) query.pageToken = args.pageToken;

  const page = await driveJson<{
    files?: GoogleDriveFile[];
    nextPageToken?: string;
  }>(accessToken, "/files", query);
  return {
    files: page.files ?? [],
    nextPageToken: page.nextPageToken,
  };
}

export async function listChildFolders(
  accessToken: string,
  parentId: string,
  driveId?: string | null
): Promise<GoogleDriveLocation[]> {
  const folders: GoogleDriveLocation[] = [];
  let pageToken: string | undefined;
  do {
    const page = await listChildrenPage(accessToken, {
      parentId,
      driveId,
      foldersOnly: true,
      pageToken,
    });
    for (const file of page.files) {
      folders.push({
        id: file.id,
        name: file.name || "Untitled folder",
        kind: "folder",
        driveId: driveId ?? null,
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken && folders.length < 200);
  return folders;
}

const MAX_SCAN_FILES = 400;

export async function listFilesForScan(
  accessToken: string,
  folderId: string,
  driveId?: string | null
): Promise<GoogleDriveFile[]> {
  const files: GoogleDriveFile[] = [];
  const queue: Array<{ id: string; driveId: string | null }> = [
    { id: folderId || "root", driveId: driveId ?? null },
  ];
  const seenFolders = new Set<string>();

  while (queue.length && files.length < MAX_SCAN_FILES) {
    const current = queue.shift()!;
    if (seenFolders.has(current.id)) continue;
    seenFolders.add(current.id);

    let pageToken: string | undefined;
    do {
      const page = await listChildrenPage(accessToken, {
        parentId: current.id,
        driveId: current.driveId,
        pageToken,
      });
      for (const file of page.files) {
        if (file.mimeType === GOOGLE_FOLDER_MIME) {
          queue.push({ id: file.id, driveId: current.driveId });
          continue;
        }
        if (file.mimeType === GOOGLE_SHORTCUT_MIME) continue;
        files.push(file);
        if (files.length >= MAX_SCAN_FILES) break;
      }
      pageToken = files.length >= MAX_SCAN_FILES ? undefined : page.nextPageToken;
    } while (pageToken);
  }

  return files;
}

async function readBinaryResponse(res: Response): Promise<{
  bytes: Uint8Array;
  contentType: string;
}> {
  const buf = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  return { bytes: buf, contentType };
}

export async function downloadGoogleDriveFile(
  accessToken: string,
  file: { id: string; mimeType?: string; name?: string }
): Promise<{ bytes: Uint8Array; mimeType: string; filename: string; text?: string }> {
  const exportMime = googleDriveExportMime(file.mimeType);
  const filename = file.name || "file";

  if (exportMime && isGoogleDriveExportableMime(file.mimeType)) {
    const res = await driveFetch(accessToken, `/files/${encodeURIComponent(file.id)}/export`, {
      mimeType: exportMime,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GoogleDriveApiError(
        res.status,
        text.slice(0, 240) || `Couldn't export this Google file (${res.status}).`
      );
    }
    const loaded = await readBinaryResponse(res);
    const mimeType = exportMime;
    const text =
      mimeType.startsWith("text/") || mimeType === "text/csv"
        ? new TextDecoder().decode(loaded.bytes)
        : undefined;
    return { bytes: loaded.bytes, mimeType, filename, text };
  }

  const res = await driveFetch(accessToken, `/files/${encodeURIComponent(file.id)}`, {
    alt: "media",
    supportsAllDrives: "true",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GoogleDriveApiError(
      res.status,
      text.slice(0, 240) || `Couldn't download this Drive file (${res.status}).`
    );
  }
  const loaded = await readBinaryResponse(res);
  const fromHeader = loaded.contentType.split(";")[0]?.trim() || "";
  const mimeType =
    fromHeader && fromHeader !== "application/octet-stream"
      ? fromHeader
      : file.mimeType || "application/octet-stream";
  return { bytes: loaded.bytes, mimeType, filename };
}
