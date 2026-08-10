import { NextResponse } from "next/server";
import {
  isLeadAuthed,
  requireEditableBusinessProfile,
  requireLeadUser,
} from "@/lib/leads/auth";
import { findPotentialDuplicates } from "@/lib/leads/duplicates";
import { mapRowToLead } from "@/lib/leads/importMap";
import {
  LEAD_IMPORT_FIELDS,
  type LeadImportField,
} from "@/lib/leads/importTypes";
import { recordLeadActivity } from "@/lib/leads/server";
import { LEAD_SELECT } from "@/lib/leads/types";
import { parseCompanyOrContact, parseOptionalText, parseUuid } from "@/lib/leads/validators";

export const runtime = "nodejs";

type MappingPayload = Partial<Record<LeadImportField, number>>;

function parseMapping(value: unknown): MappingPayload {
  if (!value || typeof value !== "object") return {};
  const mapping: MappingPayload = {};
  for (const field of LEAD_IMPORT_FIELDS) {
    const v = (value as Record<string, unknown>)[field];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) {
      mapping[field] = v;
    }
  }
  return mapping;
}

/** Bulk create leads from mapped import rows. */
export async function POST(request: Request) {
  const auth = await requireLeadUser();
  if (!isLeadAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const businessProfileId = parseUuid(
    body.businessProfileId ?? body.business_profile_id
  );
  if (!businessProfileId) {
    return NextResponse.json(
      { error: "businessProfileId is required." },
      { status: 400 }
    );
  }

  const business = await requireEditableBusinessProfile(
    supabase,
    user.id,
    businessProfileId
  );
  if (!business) {
    return NextResponse.json(
      { error: "Business workspace not found." },
      { status: 404 }
    );
  }

  const mapping = parseMapping(body.mapping);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const importSource =
    parseOptionalText(body.source) ?? "Excel Import";
  const forceCreate = body.forceCreate === true || body.forceDuplicates === true;
  const skipDuplicates = body.skipDuplicates === true;

  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows to import." }, { status: 400 });
  }

  const created: unknown[] = [];
  const duplicateRows: Array<{
    rowIndex: number;
    lead: unknown;
    reasons: string[];
    data: Record<string, string | null>;
  }> = [];
  const skipped: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) {
      skipped.push(i);
      continue;
    }

    const mapped = mapRowToLead(row as string[], mapping);
    if (!parseCompanyOrContact(mapped.companyName, mapped.contactName)) {
      skipped.push(i);
      continue;
    }

    const leadData = {
      companyName: mapped.companyName,
      contactName: mapped.contactName,
      jobTitle: mapped.jobTitle,
      email: mapped.email,
      phone: mapped.phone,
      website: mapped.website,
      notes: mapped.notes,
      source: mapped.source ?? importSource,
    };

    if (!forceCreate && !skipDuplicates) {
      const dupes = await findPotentialDuplicates(supabase, business.id, {
        email: leadData.email,
        companyName: leadData.companyName,
        contactName: leadData.contactName,
        phone: leadData.phone,
        website: leadData.website,
      });
      if (dupes.length > 0) {
        duplicateRows.push({
          rowIndex: i,
          lead: dupes[0].lead,
          reasons: dupes[0].reasons,
          data: leadData,
        });
        continue;
      }
    }

    if (skipDuplicates && !forceCreate) {
      const dupes = await findPotentialDuplicates(supabase, business.id, {
        email: leadData.email,
        companyName: leadData.companyName,
        contactName: leadData.contactName,
        phone: leadData.phone,
        website: leadData.website,
      });
      if (dupes.length > 0) {
        skipped.push(i);
        continue;
      }
    }

    const { data, error } = await supabase
      .from("business_leads")
      .insert({
        business_profile_id: business.id,
        company_name: leadData.companyName,
        contact_name: leadData.contactName,
        job_title: leadData.jobTitle,
        email: leadData.email,
        phone: leadData.phone,
        website: leadData.website,
        notes: leadData.notes,
        source: leadData.source,
        status: "new",
        created_by: user.id,
        last_activity_at: new Date().toISOString(),
      })
      .select(LEAD_SELECT)
      .single();

    if (error || !data) {
      skipped.push(i);
      continue;
    }

    try {
      await recordLeadActivity(supabase, {
        leadId: String(data.id),
        activityType: "created",
        description: "Lead imported",
        actorUserId: user.id,
        metadata: { source: "import" },
      });
    } catch {
      // Non-critical.
    }

    created.push(data);
  }

  if (duplicateRows.length > 0 && !forceCreate && !skipDuplicates) {
    return NextResponse.json({
      status: "duplicates_found",
      duplicateCount: duplicateRows.length,
      duplicateRows: duplicateRows.slice(0, 20),
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
    });
  }

  return NextResponse.json({
    status: "completed",
    createdCount: created.length,
    skippedCount: skipped.length,
    created,
  });
}
