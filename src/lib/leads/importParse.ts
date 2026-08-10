import { MAX_IMPORT_ROWS, type ParsedImportSheet } from "@/lib/leads/importTypes";
import * as XLSX from "xlsx";

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
  const lines = text
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
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [], totalRows: 0 };
  }
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];

  if (raw.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  const headers = (raw[0] ?? []).map((c) => String(c).trim());
  const dataRows = raw.slice(1).filter((row) =>
    row.some((cell) => String(cell).trim().length > 0)
  );
  const rows = dataRows
    .slice(0, MAX_IMPORT_ROWS)
    .map((row) => row.map((cell) => String(cell).trim()));

  return {
    headers,
    rows,
    totalRows: dataRows.length,
  };
}

export function parseLeadImportFile(
  buffer: Buffer,
  fileName: string,
  mimeType?: string | null
): ParsedImportSheet {
  const lower = fileName.toLowerCase();
  const isCsv =
    lower.endsWith(".csv") ||
    mimeType === "text/csv" ||
    mimeType === "application/csv";
  const isExcel =
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel";

  if (isCsv) {
    return parseCsvText(buffer.toString("utf8"));
  }
  if (isExcel) {
    return parseExcelBuffer(buffer);
  }

  // Try CSV first, then Excel
  const asText = buffer.toString("utf8");
  if (asText.includes(",") || asText.includes(";")) {
    return parseCsvText(asText);
  }
  return parseExcelBuffer(buffer);
}
