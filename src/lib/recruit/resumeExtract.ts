import "server-only";

import mammoth from "mammoth";
import { extractDocumentText } from "@/lib/analysis/extract";

export async function extractResumeText(args: {
  mimeType: string;
  base64: string;
  fileName: string;
}): Promise<{ text: string; error?: string }> {
  if (
    args.mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(args.fileName)
  ) {
    try {
      const buffer = Buffer.from(args.base64, "base64");
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.replace(/\r\n/g, "\n").trim();
      if (!text) {
        return { text: "", error: "Could not extract text from DOCX file." };
      }
      return { text };
    } catch {
      return { text: "", error: "Failed to parse DOCX file." };
    }
  }

  const extraction = await extractDocumentText(args);
  if (!extraction.text && extraction.method === "none") {
    return {
      text: "",
      error: "Could not extract text from this file format.",
    };
  }
  return { text: extraction.text };
}
