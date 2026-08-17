import "server-only";

import type { ConnectedSource, SourceItem } from "../types";
import { guessMimeFromName } from "../content/types";
import {
  downloadGoogleDriveFile,
  fetchGoogleDriveUser,
  getGoogleDriveTokens,
  listFilesForScan,
  tokensToSettings,
  type GoogleDriveTokens,
} from "./client";
import { GOOGLE_FOLDER_MIME } from "./mimes";
import { googleDriveParentForScan } from "./selectedFolder";

export function getGoogleDriveCredentials(
  source: Pick<ConnectedSource, "settings">
): GoogleDriveTokens | null {
  return getGoogleDriveTokens(source.settings);
}

export function redactGoogleDriveSettings(
  settings: Record<string, unknown>
): Record<string, unknown> {
  const {
    accessToken: _a,
    refreshToken: _r,
    tokenType: _t,
    scope: _s,
    expiresAt: _e,
    ...safe
  } = settings;
  return {
    ...safe,
    hasCredentials: Boolean(
      String(settings.refreshToken ?? "").trim() ||
        String(settings.accessToken ?? "").trim()
    ),
  };
}

export async function scanGoogleDriveSource(
  source: ConnectedSource,
  accessToken: string
): Promise<SourceItem[]> {
  const { folderId, driveId } = googleDriveParentForScan(source.settings);
  const files = await listFilesForScan(accessToken, folderId, driveId);
  return files
    .filter((file) => file.mimeType !== GOOGLE_FOLDER_MIME)
    .map((file) => {
      const size = Number(file.size ?? "");
      return {
        sourceId: source.id,
        externalId: file.id,
        name: file.name || "Untitled file",
        mimeType: file.mimeType || guessMimeFromName(file.name || ""),
        sourceUri: file.webViewLink || `https://drive.google.com/file/d/${file.id}`,
        sizeBytes: Number.isFinite(size) && size >= 0 ? size : undefined,
        modifiedAt: file.modifiedTime,
        metadata: {
          provider: "google_drive",
          kind: "file",
          folderId,
          driveId: driveId ?? null,
          googleMimeType: file.mimeType ?? null,
        },
        processingStatus: "discovered" as const,
      };
    });
}

export async function loadGoogleDriveItemAnalysisContent(
  accessToken: string,
  item: {
    externalId: string;
    name: string;
    mimeType?: string;
  }
): Promise<{
  text?: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}> {
  const loaded = await downloadGoogleDriveFile(accessToken, {
    id: item.externalId,
    mimeType: item.mimeType,
    name: item.name,
  });
  return {
    text: loaded.text,
    filename: loaded.filename,
    mimeType: loaded.mimeType,
    bytes: loaded.bytes,
  };
}

export { fetchGoogleDriveUser, tokensToSettings };
