import JSZip from "jszip";
import { IMPORT_MAX_FILE_BYTES } from "./types";

export async function extractConversationsJsonFromFile(
  file: File
): Promise<unknown> {
  if (file.size > IMPORT_MAX_FILE_BYTES) {
    throw new Error("Export file is too large (max 50 MB).");
  }

  const name = file.name.toLowerCase();
  if (name.endsWith(".json")) {
    const text = await file.text();
    return JSON.parse(text) as unknown;
  }

  if (name.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(file);
    const jsonEntry = Object.values(zip.files).find(
      (entry) =>
        !entry.dir && /(^|\/)conversations\.json$/i.test(entry.name)
    );
    if (!jsonEntry) {
      throw new Error("No conversations.json found in this ZIP file.");
    }
    const text = await jsonEntry.async("text");
    return JSON.parse(text) as unknown;
  }

  throw new Error("Upload a .json or .zip export from ChatGPT or Claude.");
}
