import { extensionOf } from "../classify";
import type { SourceItem } from "../types";

export type ScannedEntry = {
  kind: "file" | "directory";
  name: string;
  path: string;
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
};

/**
 * Recursively enumerate files under a FileSystemDirectoryHandle.
 * Metadata only — never reads file contents.
 */
export async function scanDirectoryHandle(
  root: FileSystemDirectoryHandle,
  sourceId: string,
  options?: { maxFiles?: number }
): Promise<SourceItem[]> {
  const maxFiles = options?.maxFiles ?? 10_000;
  const items: SourceItem[] = [];
  const queue: Array<{
    dir: FileSystemDirectoryHandle;
    parentPath: string;
  }> = [{ dir: root, parentPath: "" }];

  while (queue.length > 0 && items.length < maxFiles) {
    const { dir, parentPath } = queue.shift()!;
    // values() is the modern async iterator for directory entries.
    const iterator = (
      dir as FileSystemDirectoryHandle & {
        values: () => AsyncIterableIterator<
          FileSystemFileHandle | FileSystemDirectoryHandle
        >;
      }
    ).values();

    for await (const entry of iterator) {
      if (items.length >= maxFiles) break;
      const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;

      if (entry.kind === "directory") {
        queue.push({
          dir: entry as FileSystemDirectoryHandle,
          parentPath: path,
        });
        continue;
      }

      const fileHandle = entry as FileSystemFileHandle;
      let file: File;
      try {
        file = await fileHandle.getFile();
      } catch {
        // Skip unreadable entries without aborting the whole scan.
        continue;
      }

      const externalId = path || entry.name;
      const mimeType = file.type || guessMime(entry.name);
      items.push({
        sourceId,
        externalId,
        name: entry.name,
        mimeType: mimeType || undefined,
        sourceUri: `guardian-fs://file/${encodeURIComponent(path)}`,
        sizeBytes: file.size,
        modifiedAt: new Date(file.lastModified).toISOString(),
        metadata: {
          extension: extensionOf(entry.name),
          parentFolder: parentPath || root.name || "",
          relativePath: path,
          platform: "web_fs_access",
        },
        processingStatus: "discovered",
      });
    }
  }

  return items;
}

/**
 * Scan a one-shot FileList from <input webkitdirectory>.
 * Used when showDirectoryPicker is unavailable (common on mobile browsers).
 */
export function scanFileList(
  files: FileList | File[],
  sourceId: string,
  rootFolderName: string
): SourceItem[] {
  const list = Array.from(files);
  return list.map((file) => {
    const relative =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name;
    const parts = relative.split("/");
    const name = parts[parts.length - 1] || file.name;
    const parentFolder =
      parts.length > 1 ? parts.slice(0, -1).join("/") : rootFolderName;

    return {
      sourceId,
      externalId: relative || name,
      name,
      mimeType: file.type || guessMime(name) || undefined,
      sourceUri: `guardian-fs://file/${encodeURIComponent(relative)}`,
      sizeBytes: file.size,
      modifiedAt: new Date(file.lastModified).toISOString(),
      metadata: {
        extension: extensionOf(name),
        parentFolder,
        relativePath: relative,
        platform: "webkitdirectory",
      },
      processingStatus: "discovered" as const,
    };
  });
}

function guessMime(filename: string): string {
  const ext = extensionOf(filename);
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    gif: "image/gif",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    rtf: "application/rtf",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    txt: "text/plain",
    md: "text/markdown",
  };
  return map[ext] ?? "";
}

/** Pure helper for tests: build items from plain descriptors. */
export function buildItemsFromDescriptors(
  sourceId: string,
  files: Array<{
    path: string;
    name: string;
    mimeType?: string;
    sizeBytes?: number;
    modifiedAt?: string;
    parentFolder?: string;
  }>
): SourceItem[] {
  return files.map((f) => ({
    sourceId,
    externalId: f.path,
    name: f.name,
    mimeType: f.mimeType,
    sourceUri: `guardian-fs://file/${encodeURIComponent(f.path)}`,
    sizeBytes: f.sizeBytes,
    modifiedAt: f.modifiedAt,
    metadata: {
      extension: extensionOf(f.name),
      parentFolder: f.parentFolder ?? "",
      relativePath: f.path,
    },
    processingStatus: "discovered" as const,
  }));
}
