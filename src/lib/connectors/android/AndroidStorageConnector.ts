import { connectorLog } from "../log";
import type {
  ConnectedSource,
  GuardianConnector,
  SourceItem,
} from "../types";
import { ConnectorError } from "../types";
import {
  buildSourceUri,
  CHROME_BLOCKED_FOLDER_HINT,
  isLikelyMobileBrowser,
  loadDirectoryHandle,
  persistDirectoryHandle,
  requestDirectoryPermission,
  revokeDirectoryHandle,
  supportsShowDirectoryPicker,
} from "./androidStoragePermissions";
import { scanDirectoryHandle, scanFileList } from "./androidStorageScanner";

export type ConnectFolderMode = "compatible" | "persistent" | "auto";

/**
 * Phone Storage connector (android_storage).
 *
 * In this Next.js web app, folder access uses the browser File System Access
 * API (Chromium) or a webkitdirectory fallback. A future Expo/RN shell can
 * replace the pick/persist/scan internals with ACTION_OPEN_DOCUMENT_TREE
 * without changing the GuardianConnector interface or Supabase schema.
 *
 * Default connect mode is "compatible" (webkitdirectory) because Chrome blocks
 * well-known folders like Downloads/Documents in showDirectoryPicker.
 */
export class AndroidStorageConnector implements GuardianConnector {
  readonly type = "android_storage";

  /** Pending handle from connect(), keyed until source id is assigned. */
  private pendingHandle: FileSystemDirectoryHandle | null = null;
  private pendingUri: string | null = null;
  private pendingFiles: File[] | null = null;

  async connect(options?: {
    mode?: ConnectFolderMode;
  }): Promise<{
    displayName: string;
    sourceUri: string;
    settings: Record<string, unknown>;
  }> {
    connectorLog("connector_started", { type: this.type });

    if (typeof window === "undefined") {
      throw new ConnectorError(
        "unsupported",
        "Device Storage can only be connected from a browser or app on this device."
      );
    }

    const mode = options?.mode ?? "compatible";

    if (mode === "compatible") {
      return this.connectWithWebkitDirectory();
    }

    if (mode === "persistent") {
      if (!supportsShowDirectoryPicker()) {
        throw new ConnectorError(
          "unsupported",
          `${CHROME_BLOCKED_FOLDER_HINT} This browser does not support persistent folder access — use the compatible picker instead.`
        );
      }
      return this.connectWithDirectoryPicker();
    }

    // auto: mobile → compatible; desktop with FS Access → persistent
    if (isLikelyMobileBrowser() || !supportsShowDirectoryPicker()) {
      return this.connectWithWebkitDirectory();
    }
    return this.connectWithDirectoryPicker();
  }

  private async connectWithDirectoryPicker(): Promise<{
    displayName: string;
    sourceUri: string;
    settings: Record<string, unknown>;
  }> {
    try {
      const picker = (
        window as unknown as {
          showDirectoryPicker: (opts?: {
            mode?: string;
          }) => Promise<FileSystemDirectoryHandle>;
        }
      ).showDirectoryPicker;
      const handle = await picker({ mode: "read" });
      const sourceUri = buildSourceUri(handle.name);
      this.pendingHandle = handle;
      this.pendingUri = sourceUri;
      this.pendingFiles = null;

      connectorLog("folder_selected", {
        folderName: handle.name,
        platform: "web_fs_access",
      });

      return {
        displayName: `Device Storage — ${handle.name}`,
        sourceUri,
        settings: {
          folderName: handle.name,
          platform: "web_fs_access",
          persistence: "indexeddb_handle",
          privacyNote:
            "Guardian only accesses folders you choose. Files remain on your device.",
        },
      };
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      const message = err instanceof Error ? err.message : "";
      if (name === "AbortError") {
        throw new ConnectorError(
          "cancelled",
          "Folder selection was cancelled.",
          { cause: err }
        );
      }
      if (
        name === "NotAllowedError" ||
        /privacy|can't use this folder|cannot use this folder/i.test(message)
      ) {
        throw new ConnectorError(
          "unsupported",
          CHROME_BLOCKED_FOLDER_HINT,
          { cause: err }
        );
      }
      throw new ConnectorError(
        "unknown",
        "Couldn't open the folder picker. Try again.",
        { cause: err }
      );
    }
  }

  private connectWithWebkitDirectory(): Promise<{
    displayName: string;
    sourceUri: string;
    settings: Record<string, unknown>;
  }> {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.setAttribute("webkitdirectory", "");
      input.setAttribute("directory", "");
      input.style.display = "none";
      document.body.appendChild(input);

      const cleanup = () => {
        input.remove();
      };

      input.addEventListener("cancel", () => {
        cleanup();
        reject(
          new ConnectorError("cancelled", "Folder selection was cancelled.")
        );
      });

      input.addEventListener("change", () => {
        const files = input.files ? Array.from(input.files) : [];
        cleanup();
        if (files.length === 0) {
          reject(
            new ConnectorError("cancelled", "Folder selection was cancelled.")
          );
          return;
        }

        const firstRel =
          (files[0] as File & { webkitRelativePath?: string })
            .webkitRelativePath || "";
        const folderName = firstRel.split("/")[0] || "Selected folder";
        const sourceUri = buildSourceUri(folderName);
        this.pendingHandle = null;
        this.pendingUri = sourceUri;
        this.pendingFiles = files;

        connectorLog("folder_selected", {
          folderName,
          platform: "webkitdirectory",
          fileCount: files.length,
        });

        resolve({
          displayName: `Device Storage — ${folderName}`,
          sourceUri,
          settings: {
            folderName,
            platform: "webkitdirectory",
            persistence: "session_only",
            note: "This browser cannot persist folder access. Use Scan Again and re-select the folder when prompted.",
            privacyNote:
              "Guardian only accesses folders you choose. Files remain on your device.",
          },
        });
      });

      input.click();
    });
  }

  /**
   * Call after the DB row is created so the directory handle is keyed by source id.
   */
  async bindPendingPermission(sourceId: string): Promise<void> {
    if (!this.pendingUri) return;

    if (this.pendingHandle) {
      const folderName = this.pendingHandle.name;
      await persistDirectoryHandle(sourceId, this.pendingHandle, {
        sourceUri: this.pendingUri,
        folderName,
        platform: "web_fs_access",
      });
      connectorLog("permission_persisted", {
        sourceId,
        platform: "web_fs_access",
      });
      this.pendingHandle = null;
      this.pendingUri = null;
      return;
    }

    // webkitdirectory: stash File[] in memory keyed by source for immediate scan.
    if (this.pendingFiles) {
      pendingFileCache.set(sourceId, this.pendingFiles);
      this.pendingFiles = null;
      this.pendingUri = null;
    }
  }

  async disconnect(source: ConnectedSource): Promise<void> {
    connectorLog("disconnect", { sourceId: source.id });
    try {
      await revokeDirectoryHandle(source.id);
    } catch {
      // Best-effort revoke.
    }
    pendingFileCache.delete(source.id);
  }

  async verifyAccess(source: ConnectedSource): Promise<boolean> {
    const loaded = await loadDirectoryHandle(source.id).catch(() => null);
    if (loaded) {
      return requestDirectoryPermission(loaded.handle, "read");
    }
    if (pendingFileCache.has(source.id)) return true;
    // webkitdirectory connections cannot restore access after reload.
    const platform = source.settings?.platform;
    if (platform === "webkitdirectory") return false;
    return false;
  }

  async scan(source: ConnectedSource): Promise<SourceItem[]> {
    connectorLog("scan_started", { sourceId: source.id });

    const cachedFiles = pendingFileCache.get(source.id);
    if (cachedFiles) {
      const folderName = String(
        source.settings?.folderName ?? "Selected folder"
      );
      const items = scanFileList(cachedFiles, source.id, folderName);
      // Clear one-shot cache after first scan; re-scan needs re-pick.
      pendingFileCache.delete(source.id);
      connectorLog("files_discovered", {
        sourceId: source.id,
        count: items.length,
      });
      return items;
    }

    const loaded = await loadDirectoryHandle(source.id).catch(() => null);
    if (!loaded) {
      // No persisted handle — prompt with compatible picker (works with Downloads).
      const picked = await this.connectWithWebkitDirectory();
      if (!this.pendingFiles) {
        throw new ConnectorError(
          "permission_revoked",
          "Guardian no longer has access to this folder."
        );
      }
      const items = scanFileList(
        this.pendingFiles,
        source.id,
        String(picked.settings.folderName ?? "Selected folder")
      );
      this.pendingFiles = null;
      this.pendingUri = null;
      connectorLog("files_discovered", {
        sourceId: source.id,
        count: items.length,
      });
      return items;
    }

    const granted = await requestDirectoryPermission(loaded.handle, "read");
    if (!granted) {
      connectorLog("permission_failure", { sourceId: source.id });
      throw new ConnectorError(
        "permission_revoked",
        "Guardian no longer has access to this folder."
      );
    }

    try {
      const items = await scanDirectoryHandle(loaded.handle, source.id);
      connectorLog("files_discovered", {
        sourceId: source.id,
        count: items.length,
      });
      return items;
    } catch (err) {
      throw new ConnectorError(
        "read_failed",
        "This folder could not be read. Check access and try again.",
        { cause: err }
      );
    }
  }

  async getItem(item: SourceItem): Promise<SourceItem> {
    return item;
  }
}

/** In-memory File[] for webkitdirectory one-shot sessions. */
const pendingFileCache = new Map<string, File[]>();

export function getAndroidStorageConnector(): AndroidStorageConnector {
  return new AndroidStorageConnector();
}
