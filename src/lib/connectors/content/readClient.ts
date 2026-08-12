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
      "This file type isn't supported for Analyze yet. Try a PDF, image, text, or CSV file."
    );
  }

  const relativePath = String(
    item.metadata?.relativePath ?? item.externalId ?? item.name
  );

  const loaded = await loadDirectoryHandle(item.sourceId).catch(() => null);
  if (loaded) {
    const granted = await requestDirectoryPermission(loaded.handle, "read");
    if (!granted) {
      throw new ConnectorError(
        "permission_revoked",
        "Guardian no longer has access to this folder. Reconnect Device Storage and try again."
      );
    }
    try {
      const file = await getFileFromDirectory(loaded.handle, relativePath);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const resolvedMime = file.type || mime;
      const text = maybeDecodeText(resolvedMime, bytes);
      return {
        mimeType: resolvedMime,
        filename: item.name,
        bytes,
        text,
        metadata: {
          relativePath,
          sizeBytes: bytes.byteLength,
          lastModified: file.lastModified,
        },
      };
    } catch (err) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError(
        "read_failed",
        "Couldn't read this file from the connected folder. Try Scan Again or reconnect access.",
        { cause: err }
      );
    }
  }

  // No persisted handle — prompt user to re-select the file.
  const file = await pickSingleFile(item.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const resolvedMime = file.type || mime;
  return {
    mimeType: resolvedMime,
    filename: item.name,
    bytes,
    text: maybeDecodeText(resolvedMime, bytes),
    metadata: {
      relativePath,
      sizeBytes: bytes.byteLength,
      picked: true,
    },
  };
}

async function getFileFromDirectory(
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

function pickSingleFile(expectedName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.txt,.md,.csv,.jpg,.jpeg,.png,.webp,.gif,.heic,image/*,application/pdf,text/*";
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
      // Soft hint only — user may pick the correct file under a slightly different name.
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
