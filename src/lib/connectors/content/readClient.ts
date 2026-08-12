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

export type ReadSourceOptions = {
  /** Reuse a granted directory handle across a batch. */
  directoryHandle?: FileSystemDirectoryHandle;
  /**
   * One-shot folder share (webkitdirectory). Keys are lowercased relative
   * paths and basenames for lookup.
   */
  fileIndex?: Map<string, File>;
  /** Default true. Batch mode sets false to avoid N file pickers. */
  allowSingleFileFallback?: boolean;
};

export type BatchReadAccess = {
  directoryHandle?: FileSystemDirectoryHandle;
  fileIndex?: Map<string, File>;
};

/**
 * Read a Device Storage source item temporarily in the browser.
 * Bytes stay in memory for the analyze request only.
 */
export async function readSourceItemContent(
  item: SourceItem & { id: string },
  options: ReadSourceOptions = {}
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
  const allowSingle = options.allowSingleFileFallback !== false;

  if (options.fileIndex && options.fileIndex.size > 0) {
    const file = findInFileIndex(options.fileIndex, relativePath, item.name);
    if (file) {
      return toSourceContent(file, item.name, mime, relativePath, true);
    }
  }

  const handle =
    options.directoryHandle ??
    (await loadDirectoryHandle(item.sourceId).catch(() => null))?.handle;

  if (handle) {
    const granted = await requestDirectoryPermission(handle, "read");
    if (granted) {
      try {
        const file = await getFileFromDirectory(
          handle,
          relativePath,
          item.name
        );
        return await toSourceContent(file, item.name, mime, relativePath, false);
      } catch {
        // Path mismatch — fall through.
      }
    }
  }

  if (!allowSingle) {
    throw new ConnectorError(
      "read_failed",
      `Couldn't find "${item.name}" in the selected folder. Choose the same folder you connected, then try again.`
    );
  }

  const file = await pickSingleFile(item.name);
  return toSourceContent(file, item.name, mime, relativePath, true);
}

/**
 * Prepare folder access once for a batch Analyze run.
 * Prefers a persisted FS Access handle; otherwise prompts for a compatible
 * folder share (webkitdirectory) so Downloads works in Chrome.
 */
export async function ensureBatchReadAccess(
  sourceId: string
): Promise<BatchReadAccess> {
  const loaded = await loadDirectoryHandle(sourceId).catch(() => null);
  if (loaded) {
    const granted = await requestDirectoryPermission(loaded.handle, "read");
    if (granted) {
      return { directoryHandle: loaded.handle };
    }
  }

  const files = await pickFolderFiles();
  return { fileIndex: buildFileIndex(files) };
}

export function buildFileIndex(files: File[]): Map<string, File> {
  const index = new Map<string, File>();
  for (const file of files) {
    const relative = String(
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
        file.name
    )
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
    const keys = uniquePaths([
      relative,
      relative.split("/").slice(1).join("/"),
      relative.split("/").slice(-2).join("/"),
      file.name,
    ]);
    for (const key of keys) {
      index.set(key.toLowerCase(), file);
    }
  }
  return index;
}

function findInFileIndex(
  index: Map<string, File>,
  relativePath: string,
  fileName: string
): File | null {
  const normalized = relativePath.replace(/\\/g, "/");
  const candidates = uniquePaths([
    normalized,
    normalized.split("/").slice(1).join("/"),
    normalized.split("/").slice(-2).join("/"),
    fileName,
  ]);
  for (const c of candidates) {
    const hit = index.get(c.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

function pickFolderFiles(): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.style.display = "none";
    document.body.appendChild(input);

    const cleanup = () => input.remove();

    input.addEventListener("cancel", () => {
      cleanup();
      reject(
        new ConnectorError(
          "cancelled",
          "Folder selection was cancelled. Guardian needs temporary access to analyze these files."
        )
      );
    });

    input.addEventListener("change", () => {
      const list = input.files ? Array.from(input.files) : [];
      cleanup();
      if (!list.length) {
        reject(
          new ConnectorError("cancelled", "Folder selection was cancelled.")
        );
        return;
      }
      resolve(list);
    });

    input.click();
  });
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
