/**
 * Persist directory handles for Phone Storage connections.
 *
 * This Next.js app has no Expo/RN shell. On Chromium browsers we use the
 * File System Access API and store FileSystemDirectoryHandle in IndexedDB
 * (the web equivalent of Android persistent URI permissions).
 *
 * True ACTION_OPEN_DOCUMENT_TREE requires a future native Android shell.
 */

const DB_NAME = "guardian_connectors";
const DB_VERSION = 1;
const STORE = "directory_handles";

export type PersistedFolderPermission = {
  sourceId: string;
  /** Original URI / handle key stored in connected_sources.source_uri */
  sourceUri: string;
  folderName: string;
  platform: "web_fs_access" | "webkitdirectory" | "android_saf";
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "sourceId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export async function persistDirectoryHandle(
  sourceId: string,
  handle: FileSystemDirectoryHandle,
  meta: Omit<PersistedFolderPermission, "sourceId">
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({
      sourceId,
      handle,
      ...meta,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to persist handle"));
  });
  db.close();
}

export async function loadDirectoryHandle(
  sourceId: string
): Promise<{
  handle: FileSystemDirectoryHandle;
  meta: PersistedFolderPermission;
} | null> {
  const db = await openDb();
  const row = await new Promise<Record<string, unknown> | undefined>(
    (resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(sourceId);
      req.onsuccess = () => resolve(req.result as Record<string, unknown> | undefined);
      req.onerror = () => reject(req.error ?? new Error("Failed to load handle"));
    }
  );
  db.close();
  if (!row?.handle) return null;
  return {
    handle: row.handle as FileSystemDirectoryHandle,
    meta: {
      sourceId,
      sourceUri: String(row.sourceUri ?? ""),
      folderName: String(row.folderName ?? "Folder"),
      platform: (row.platform as PersistedFolderPermission["platform"]) ?? "web_fs_access",
    },
  };
}

export async function revokeDirectoryHandle(sourceId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(sourceId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to revoke handle"));
  });
  db.close();
}

export function supportsShowDirectoryPicker(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as Window & { showDirectoryPicker?: unknown })
      .showDirectoryPicker === "function"
  );
}

export async function requestDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  mode: "read" | "readwrite" = "read"
): Promise<boolean> {
  const withPerm = handle as FileSystemDirectoryHandle & {
    queryPermission?: (opts: { mode: string }) => Promise<PermissionState>;
    requestPermission?: (opts: { mode: string }) => Promise<PermissionState>;
  };
  if (typeof withPerm.queryPermission === "function") {
    const current = await withPerm.queryPermission({ mode });
    if (current === "granted") return true;
  }
  if (typeof withPerm.requestPermission === "function") {
    const next = await withPerm.requestPermission({ mode });
    return next === "granted";
  }
  // Older implementations: assume readable if we still have the handle.
  return true;
}

export function buildSourceUri(folderName: string): string {
  const safe = encodeURIComponent(folderName || "folder");
  return `guardian-fs://directory/${safe}/${crypto.randomUUID()}`;
}
