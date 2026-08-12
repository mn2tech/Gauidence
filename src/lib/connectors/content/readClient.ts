"use client";

import { ConnectorError } from "../types";
import type { SourceItem } from "../types";
import {
  loadDirectoryHandle,
  requestDirectoryPermission,
} from "../android/androidStoragePermissions";
import {
  guessMimeFromName,
  isAnalyzeSupportedMime,
  type SourceContent,
} from "./types";

/**
 * Read a Device Storage source item temporarily in the browser.
 * Bytes stay in memory for the analyze request only.
 */
export async function readSourceItemContent(
  item: SourceItem & { id: string }
): Promise<SourceContent> {
  const mime =
    item.mimeType || guessMimeFromName(item.name) || "application/octet-stream";

  if (!isAnalyzeSupportedMime(mime, item.name)) {
    throw new ConnectorError(
      "unsupported",
      "This file type isn't supported for Analyze yet. Try a PDF, image, text, CSV, or Excel file."
    );
  }

  const relativePath = String(
    item.metadata?.relativePath ?? item.externalId ?? item.name
  );

  const loaded = await loadDirectoryHandle(item.sourceId).catch(() => null);
  if (loaded) {
    const granted = await requestDirectoryPermission(loaded.handle, "read");
    if (granted) {
      try {
        const file = await getFileFromDirectory(
          loaded.handle,
          relativePath,
          item.name
        );
        return await toSourceContent(file, item.name, mime, relativePath, false);
      } catch {
        // Path mismatch or stale handle — fall through to single-file picker.
      }
    }
  }

  // No usable persisted handle — prompt user to re-select this one file.
  const file = await pickSingleFile(item.name);
  return toSourceContent(file, item.name, mime, relativePath, true);
}

async function toSourceContent(
  file: File,
  filename: string,
  fallbackMime: string,
  relativePath: string,
  picked: boolean
): Promise<SourceContent> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const resolvedMime = file.type || fallbackMime;
  return {
    mimeType: resolvedMime,
    filename,
    bytes,
    text: maybeDecodeText(resolvedMime, bytes),
    metadata: {
      relativePath,
      sizeBytes: bytes.byteLength,
      lastModified: file.lastModified,
      picked,
    },
  };
}

/**
 * Resolve a file under a directory handle.
 * Tries several path shapes because webkitdirectory paths often include the
 * root folder name while FS Access handles are already rooted there.
 */
async function getFileFromDirectory(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  fileName: string
): Promise<File> {
  const normalized = relativePath.replace(/\\/g, "/");
  const candidates = uniquePaths([
    normalized,
    stripRootPrefix(normalized, root.name),
    fileName,
    // parentFolder/name style
    normalized.includes("/")
      ? normalized.split("/").slice(-2).join("/")
      : fileName,
  ]);

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await openPath(root, candidate);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ConnectorError("read_failed", "File not found in connected folder.");
}

async function openPath(
  root: FileSystemDirectoryHandle,
  relativePath: string
): Promise<File> {
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length === 0) {
    throw new ConnectorError("read_failed", "Missing file path.");
  }

  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]!);
  }
  const fileHandle = await dir.getFileHandle(parts[parts.length - 1]!);
  return fileHandle.getFile();
}

function stripRootPrefix(path: string, rootName: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length > 1 && parts[0]?.toLowerCase() === rootName.toLowerCase()) {
    return parts.slice(1).join("/");
  }
  return path;
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const key = p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    out.push(key);
  }
  return out;
}

function pickSingleFile(expectedName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      ".pdf,.txt,.md,.csv,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.gif,.heic,image/*,application/pdf,text/*,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    input.style.display = "none";
    document.body.appendChild(input);

    const cleanup = () => input.remove();

    input.addEventListener("cancel", () => {
      cleanup();
      reject(
        new ConnectorError(
          "cancelled",
          "File selection was cancelled. Guardian needs temporary access to analyze this file."
        )
      );
    });

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        reject(
          new ConnectorError("cancelled", "File selection was cancelled.")
        );
        return;
      }
      void expectedName;
      resolve(file);
    });

    input.click();
  });
}

function maybeDecodeText(mime: string, bytes: Uint8Array): string | undefined {
  if (
    mime.startsWith("text/") ||
    mime === "application/csv" ||
    mime === "text/csv"
  ) {
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** SHA-256 hex of bytes for idempotent analysis. */
export async function hashSourceBytes(bytes: Uint8Array): Promise<string> {
  const copy = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
