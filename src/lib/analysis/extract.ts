import "server-only";

import {
  extractText,
  extractTextItems,
  getDocumentProxy,
  renderPageAsImage,
} from "unpdf";
import {
  assessExtractionQuality,
  isAnalysisDebugEnabled,
  previewText,
  scoreExtractionQuality,
} from "./extract-quality";

export type ExtractionMethod =
  | "native_pdf"
  | "native_pdf_layout"
  | "vision_ocr"
  | "image_fallback"
  | "none";

export type PageImage = {
  page: number;
  dataUrl: string;
};

export type ExtractionResult = {
  text: string;
  method: ExtractionMethod;
  quality: number; // 0–1
  pageCount: number | null;
  charCount: number;
  reason: string;
  /** Serialized table rows when available (preserves column structure). */
  tablesText: string;
  issues: string[];
  estimatedLineRows: number;
  /** High-res page images for OCR when text layer is missing (in-memory only). */
  pageImages: PageImage[];
  nativeTextPreview: string;
};

export { scoreExtractionQuality, previewText, isAnalysisDebugEnabled, assessExtractionQuality };

type TextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL?: boolean;
};

/**
 * Reconstruct reading order and approximate table rows from positioned text items.
 * PDF y grows upward; we sort top-to-bottom, then left-to-right within a line.
 */
export function layoutTextFromItems(pages: TextItem[][]): {
  text: string;
  tablesText: string;
} {
  const pageBlocks: string[] = [];
  const tableBlocks: string[] = [];

  for (const pageItems of pages) {
    const items = pageItems
      .filter((it) => (it.str ?? "").trim().length > 0)
      .map((it) => ({ ...it, str: it.str.replace(/\s+/g, " ").trim() }));
    if (items.length === 0) continue;

    const heights = items.map((i) => i.height || 8);
    const medianH =
      heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)] ?? 10;
    const lineTol = Math.max(2, medianH * 0.6);

    // Group into lines by Y
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: TextItem[][] = [];
    for (const item of sorted) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last[0]!.y - item.y) <= lineTol) {
        last.push(item);
      } else {
        lines.push([item]);
      }
    }

    const pageLines: string[] = [];
    for (const lineItems of lines) {
      lineItems.sort((a, b) => a.x - b.x);
      // Join with spaces; use | when large horizontal gaps suggest columns
      let row = "";
      let prevRight = -Infinity;
      const gaps: number[] = [];
      for (let i = 1; i < lineItems.length; i++) {
        const gap = lineItems[i]!.x - (lineItems[i - 1]!.x + lineItems[i - 1]!.width);
        gaps.push(gap);
      }
      const gapMedian =
        gaps.length > 0
          ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!
          : 0;
      const colGap = Math.max(18, gapMedian * 2.5);

      for (const it of lineItems) {
        if (row && it.x - prevRight > colGap) row += " | ";
        else if (row) row += " ";
        row += it.str;
        prevRight = it.x + it.width;
      }
      pageLines.push(row.trim());
      if ((row.match(/\|/g) ?? []).length >= 2) {
        tableBlocks.push(row.trim());
      }
    }
    pageBlocks.push(pageLines.join("\n"));
  }

  const text = pageBlocks.join("\n\n").trim();
  const tablesText =
    tableBlocks.length > 0
      ? `TABLE:\n${tableBlocks.join("\n")}`
      : "";
  return { text, tablesText };
}

async function renderPdfPageImages(bytes: Uint8Array, pageCount: number): Promise<PageImage[]> {
  const images: PageImage[] = [];
  const maxPages = Math.min(pageCount, 4);
  for (let page = 1; page <= maxPages; page++) {
    try {
      const dataUrl = await renderPageAsImage(bytes, page, {
        canvasImport: () => import("@napi-rs/canvas"),
        scale: 2,
        toDataURL: true,
      });
      if (typeof dataUrl === "string" && dataUrl.startsWith("data:")) {
        images.push({ page, dataUrl });
      }
    } catch {
      // Canvas may be unavailable on some hosts — caller falls back to PDF file OCR.
    }
  }
  return images;
}

/**
 * Prefer native PDF text (+ layout). Do not OCR text-layer PDFs.
 * Image-only / Print-to-PDF files get page images for a vision OCR pass.
 */
export async function extractDocumentText(args: {
  mimeType: string;
  base64: string;
  fileName: string;
}): Promise<ExtractionResult> {
  if (args.mimeType === "application/pdf") {
    try {
      const bytes = Uint8Array.from(Buffer.from(args.base64, "base64"));
      const pdf = await getDocumentProxy(bytes);
      const pageCount = pdf.numPages ?? null;

      const itemsResult = await extractTextItems(pdf);
      const layout = layoutTextFromItems(
        (itemsResult.items ?? []) as TextItem[][]
      );

      let rawMerged = "";
      try {
        const merged = await extractText(pdf, { mergePages: true });
        rawMerged = String(merged.text ?? "").replace(/\r\n/g, "\n").trim();
      } catch {
        rawMerged = "";
      }

      const layoutReport = assessExtractionQuality(layout.text);
      const mergedReport = assessExtractionQuality(rawMerged);
      const useLayout = layoutReport.score >= mergedReport.score;
      const nativeText = useLayout ? layout.text : rawMerged;
      const tablesText = useLayout ? layout.tablesText : "";
      const combined = tablesText
        ? `${nativeText}\n\n--- EXTRACTED TABLES (preserve columns) ---\n${tablesText}`
        : nativeText;
      const report = assessExtractionQuality(combined);

      // Always prepare page images for short PDFs or poor text (visual / hybrid modes).
      const shouldRenderPages =
        report.score < 0.45 ||
        (pageCount != null && pageCount <= 4) ||
        (pageCount != null && pageCount <= 8 && report.score < 0.7);

      const pageImages = shouldRenderPages
        ? await renderPdfPageImages(bytes, pageCount ?? 1)
        : [];

      return {
        text: combined,
        tablesText,
        method: useLayout && layout.text ? "native_pdf_layout" : "native_pdf",
        quality: report.score,
        pageCount,
        charCount: combined.length,
        issues: report.issues,
        estimatedLineRows: report.estimatedLineRows,
        pageImages,
        nativeTextPreview: previewText(combined || "[empty native text layer]", 800),
        reason:
          report.score >= 0.45 && pageImages.length === 0
            ? "Native PDF text layer scored usable; page images not required."
            : report.score >= 0.45 && pageImages.length > 0
              ? "Native text available; page images prepared for visual/hybrid analysis."
              : pageImages.length > 0
                ? "Native PDF text missing or poor (likely Print-to-PDF / scan); page images prepared for visual analysis."
                : "Native PDF text missing or poor; visual file fallback required.",
      };
    } catch {
      return {
        text: "",
        tablesText: "",
        method: "none",
        quality: 0,
        pageCount: null,
        charCount: 0,
        issues: ["native_extract_failed"],
        estimatedLineRows: 0,
        pageImages: [],
        nativeTextPreview: "[native extract failed]",
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
    issues: ["image_document"],
    estimatedLineRows: 0,
    pageImages: [],
    nativeTextPreview: "",
    reason: "Image document; relying on vision OCR.",
  };
}

/** Dev-only diagnostic payload — never returned unless GUARDIAN_ANALYSIS_DEBUG=1. */
export type AnalysisDiagnostic = {
  extraction: Omit<ExtractionResult, "pageImages"> & {
    pageImageCount: number;
  };
  classifierInputPreview: string;
  specialistInputPreview: string;
  ocrTextPreview?: string;
  rawModelJson?: unknown;
  finalJson?: unknown;
};
