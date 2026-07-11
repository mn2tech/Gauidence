import "server-only";

import { PDFParse } from "pdf-parse";
import {
  isAnalysisDebugEnabled,
  previewText,
  scoreExtractionQuality,
} from "./extract-quality";

export type ExtractionMethod = "native_pdf" | "native_pdf_tables" | "image_fallback" | "none";

export type ExtractionResult = {
  text: string;
  method: ExtractionMethod;
  quality: number; // 0–1
  pageCount: number | null;
  charCount: number;
  reason: string;
  /** Serialized table rows when available (preserves column structure). */
  tablesText: string;
};

export { scoreExtractionQuality, previewText, isAnalysisDebugEnabled };

function formatTables(tables: unknown): string {
  if (!tables || typeof tables !== "object") return "";
  const pages = (tables as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) return "";
  const blocks: string[] = [];
  for (const page of pages) {
    const pageTables = (page as { tables?: unknown }).tables;
    if (!Array.isArray(pageTables)) continue;
    for (const table of pageTables) {
      const rows = Array.isArray(table) ? table : (table as { rows?: unknown }).rows;
      if (!Array.isArray(rows)) continue;
      blocks.push("TABLE:");
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        blocks.push(
          row
            .map((cell) => String(cell ?? "").replace(/\s+/g, " ").trim())
            .join(" | ")
        );
      }
      blocks.push("");
    }
  }
  return blocks.join("\n").trim();
}

/**
 * Prefer native PDF text (+ tables). Do not OCR text-layer PDFs.
 * Images have no native text here — quality 0, vision fallback later.
 */
export async function extractDocumentText(args: {
  mimeType: string;
  base64: string;
  fileName: string;
}): Promise<ExtractionResult> {
  const buffer = Buffer.from(args.base64, "base64");

  if (args.mimeType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const textResult = await parser.getText();
      let tablesText = "";
      try {
        const tableResult = await parser.getTable();
        tablesText = formatTables(tableResult);
      } catch {
        // Tables are optional enhancement.
      }
      await parser.destroy();

      const text = (textResult.text ?? "").replace(/\r\n/g, "\n").trim();
      const combined = tablesText
        ? `${text}\n\n--- EXTRACTED TABLES (preserve columns) ---\n${tablesText}`
        : text;
      const quality = Math.max(
        scoreExtractionQuality(text),
        tablesText ? Math.min(1, scoreExtractionQuality(text) + 0.1) : 0
      );
      const pageCount =
        typeof textResult.total === "number"
          ? textResult.total
          : Array.isArray(textResult.pages)
            ? textResult.pages.length
            : null;

      return {
        text: combined,
        tablesText,
        method: tablesText ? "native_pdf_tables" : "native_pdf",
        quality,
        pageCount,
        charCount: combined.length,
        reason:
          quality >= 0.45
            ? "Native PDF text layer scored usable; OCR skipped."
            : quality < 0.2
              ? "Native PDF text appears sparse or corrupted; prefer file/vision fallback."
              : "Native PDF text is partial; model may also receive the file.",
      };
    } catch {
      try {
        await parser.destroy();
      } catch {
        // ignore
      }
      return {
        text: "",
        tablesText: "",
        method: "none",
        quality: 0,
        pageCount: null,
        charCount: 0,
        reason: "Native PDF text extraction failed; using file/vision fallback.",
      };
    }
  }

  return {
    text: "",
    tablesText: "",
    method: "image_fallback",
    quality: 0,
    pageCount: null,
    charCount: 0,
    reason: "Image document; relying on vision model (no local OCR).",
  };
}

/** Dev-only diagnostic payload — never returned unless GUARDIAN_ANALYSIS_DEBUG=1. */
export type AnalysisDiagnostic = {
  extraction: ExtractionResult;
  classifierInputPreview: string;
  specialistInputPreview: string;
  rawModelJson?: unknown;
  finalJson?: unknown;
};
