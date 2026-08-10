import { NextResponse } from "next/server";
import {
  isLeadAuthed,
  requireEditableBusinessProfile,
  requireLeadUser,
} from "@/lib/leads/auth";
import { parseLeadImportFile } from "@/lib/leads/importParse";
import { suggestColumnMapping } from "@/lib/leads/importMap";
import { MAX_IMPORT_ROWS } from "@/lib/leads/importTypes";
import { parseUuid } from "@/lib/leads/validators";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Parse an uploaded CSV/Excel file and suggest column mapping. */
export async function POST(request: Request) {
  const auth = await requireLeadUser();
  if (!isLeadAuthed(auth)) return auth;

  const form = await request.formData();
  const businessProfileId = parseUuid(
    form.get("businessProfileId") ?? form.get("business_profile_id")
  );
  const file = form.get("file");

  if (!businessProfileId) {
    return NextResponse.json(
      { error: "businessProfileId is required." },
      { status: 400 }
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a CSV or Excel file." }, { status: 400 });
  }

  const business = await requireEditableBusinessProfile(
    auth.supabase,
    auth.user.id,
    businessProfileId
  );
  if (!business) {
    return NextResponse.json(
      { error: "Business workspace not found." },
      { status: 404 }
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "File is larger than 10 MB." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseLeadImportFile(buffer, file.name, file.type);

  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    return NextResponse.json(
      { error: "No rows found in the file." },
      { status: 400 }
    );
  }

  const suggestedMapping = suggestColumnMapping(parsed.headers);
  const previewRows = parsed.rows.slice(0, 10);

  return NextResponse.json({
    headers: parsed.headers,
    previewRows,
    totalRows: parsed.totalRows,
    importCap: MAX_IMPORT_ROWS,
    truncated: parsed.totalRows > MAX_IMPORT_ROWS,
    suggestedMapping,
    rows: parsed.rows,
  });
}
