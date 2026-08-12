import "server-only";

import * as XLSX from "xlsx";

const MAX_SHEETS = 8;
const MAX_CHARS = 12_000;

/**
 * Convert Excel workbook bytes to plain text for ontology extraction.
 * Does not persist the file.
 */
export function extractExcelText(args: {
  bytes: Uint8Array;
  fileName: string;
}): { text: string; sheetCount: number } {
  const workbook = XLSX.read(Buffer.from(args.bytes), {
    type: "buffer",
    cellDates: true,
  });

  const sheets = workbook.SheetNames.slice(0, MAX_SHEETS);
  const blocks: string[] = [];

  for (const name of sheets) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
    if (!csv) continue;
    blocks.push(`## Sheet: ${name}\n${csv}`);
  }

  let text = blocks.join("\n\n").trim();
  if (text.length > MAX_CHARS) {
    text = `${text.slice(0, MAX_CHARS)}\n\n[Truncated Excel content from ${args.fileName}]`;
  }

  return { text, sheetCount: sheets.length };
}

export function isExcelMimeOrName(
  mimeType?: string | null,
  fileName?: string
): boolean {
  const mime = (mimeType ?? "").toLowerCase();
  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/excel"
  ) {
    return true;
  }
  return /\.xlsx?$/i.test(fileName ?? "");
}
