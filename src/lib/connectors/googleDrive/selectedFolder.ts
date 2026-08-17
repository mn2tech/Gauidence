/** Which Drive folder / shared drive Scan should use. Stored on connection settings. */

export type GoogleDriveLocationKind = "my_drive" | "shared_drive" | "folder";

export function googleDriveSelectedFolderId(
  settings?: Record<string, unknown> | null
): string | null {
  const id = String(settings?.folderId ?? "").trim();
  return id || null;
}

export function googleDriveSelectedFolderName(
  settings?: Record<string, unknown> | null
): string | null {
  const name = String(settings?.folderName ?? "").trim();
  return name || null;
}

export function googleDriveSelectedDriveId(
  settings?: Record<string, unknown> | null
): string | null {
  const id = String(settings?.driveId ?? "").trim();
  return id || null;
}

export function googleDriveSelectedKind(
  settings?: Record<string, unknown> | null
): GoogleDriveLocationKind {
  const kind = String(settings?.folderKind ?? "").trim();
  if (kind === "shared_drive" || kind === "folder" || kind === "my_drive") {
    return kind;
  }
  if (googleDriveSelectedDriveId(settings)) return "shared_drive";
  const folderId = googleDriveSelectedFolderId(settings);
  if (folderId && folderId !== "root") return "folder";
  return "my_drive";
}

export function googleDriveParentForScan(
  settings?: Record<string, unknown> | null
): { folderId: string; driveId: string | null } {
  const folderId = googleDriveSelectedFolderId(settings) ?? "root";
  const driveId = googleDriveSelectedDriveId(settings);
  return { folderId, driveId };
}
