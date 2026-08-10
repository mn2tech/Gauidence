import "server-only";

import { MAX_IMPORT_ROWS, type ParsedImportSheet } from "@/lib/leads/importTypes";
import * as XLSX from "xlsx";

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === "," || ch === ";") && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseCsvText(text: string): ParsedImportSheet {
  const normalized = stripBom(text);
  const lines = normalized
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  const headers = parseCsvLine(lines[0]);
  const dataLines = lines.slice(1);
  const rows = dataLines
    .slice(0, MAX_IMPORT_ROWS)
    .map((line) => parseCsvLine(line));

  return {
    headers,
    rows,
    totalRows: dataLines.length,
  };
}

function parseExcelBuffer(buffer: Buffer): ParsedImportSheet {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [], totalRows: 0 };
  }
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  }) as unknown[][];

  if (raw.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  const stringRows = raw.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) =>
      cell == null ? "" : String(cell).trim()
    )
  );

  const headerRowIndex = stringRows.findIndex(
    (row) => row.filter((c) => c.length > 0).length >= 2
  );
  if (headerRowIndex < 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  const headers = stringRows[headerRowIndex];
  const dataRows = stringRows
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => cell.length > 0));
  const rows = dataRows.slice(0, MAX_IMPORT_ROWS);

  return {
    headers,
    rows,
    totalRows: dataRows.length,
  };
}

function isCsvFile(fileName: string, mimeType?: string | null): boolean {
  const lower = fileName.toLowerCase();
  return (
    lower.endsWith(".csv") ||
    lower.endsWith(".txt") ||
    mimeType === "text/csv" ||
    mimeType === "application/csv" ||
    mimeType === "text/plain"
  );
}

function isExcelFile(fileName: string, mimeType?: string | null): boolean {
  const lower = fileName.toLowerCase();
  return (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".xlsm") ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.ms-excel.sheet.macroEnabled.12"
  );
}

export function parseLeadImportFile(
  buffer: Buffer,
  fileName: string,
  mimeType?: string | null
): ParsedImportSheet {
  const lower = fileName.toLowerCase();

  if (isCsvFile(lower, mimeType)) {
    return parseCsvText(buffer.toString("utf8"));
  }
  if (isExcelFile(lower, mimeType)) {
    return parseExcelBuffer(buffer);
  }

  // Extension missing (common on mobile): sniff binary Excel (ZIP / OLE)
  const isZip =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04;
  const isOle =
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0;

  if (isZip || isOle) {
    return parseExcelBuffer(buffer);
  }

  const asText = stripBom(buffer.toString("utf8"));
  if (asText.includes(",") || asText.includes(";") || asText.includes("\t")) {
    return parseCsvText(asText);
  }

  return parseExcelBuffer(buffer);
}
