import { NextResponse } from "next/server";
import {
  isLeadAuthed,
  requireEditableBusinessProfile,
  requireLeadUser,
  resolveBusinessProfile,
} from "@/lib/leads/auth";
import { recordLeadActivity, listBusinessLeads } from "@/lib/leads/server";
import { LEAD_SELECT } from "@/lib/leads/types";
import {
  parseCompanyOrContact,
  parseLeadSearchQuery,
  parseLeadStatus,
  parseOptionalText,
  parseUuid,
} from "@/lib/leads/validators";

export const runtime = "nodejs";

/** List or create leads for a business workspace. */
export async function GET(request: Request) {
  const auth = await requireLeadUser();
  if (!isLeadAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  const businessProfileId =
    url.searchParams.get("businessProfileId") ??
    url.searchParams.get("profileId");
  const status = parseLeadStatus(url.searchParams.get("status") ?? "");
  const search = parseLeadSearchQuery(url.searchParams.get("q"));

  const business = await resolveBusinessProfile(
    supabase,
    user,
    businessProfileId
  );
  if (!business) {
    return NextResponse.json(
      { error: "Switch to a business workspace to view leads." },
      { status: 400 }
    );
  }

  try {
    const leads = await listBusinessLeads(supabase, business.id, {
      status,
      search,
    });
    return NextResponse.json({ leads });
  } catch {
    return NextResponse.json(
      { error: "Couldn't load leads." },
      { status: 500 }
    );
  }
}

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

  const names = parseCompanyOrContact(
    body.companyName ?? body.company_name,
    body.contactName ?? body.contact_name
  );
  if (!names) {
    return NextResponse.json(
      { error: "Company name or contact name is required." },
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

  const status = parseLeadStatus(body.status) ?? "new";

  const { data, error } = await supabase
    .from("business_leads")
    .insert({
      business_profile_id: business.id,
      company_name: names.companyName,
      contact_name: names.contactName,
      job_title: parseOptionalText(body.jobTitle ?? body.job_title),
      email: parseOptionalText(body.email),
      phone: parseOptionalText(body.phone),
      website: parseOptionalText(body.website),
      address: parseOptionalText(body.address),
      source: parseOptionalText(body.source),
      source_detail: parseOptionalText(
        body.sourceDetail ?? body.source_detail ?? body.whereWeMet
      ),
      notes: parseOptionalText(body.notes),
      status,
      created_by: user.id,
      last_activity_at: new Date().toISOString(),
    })
    .select(LEAD_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't create lead." },
      { status: 500 }
    );
  }

  try {
    await recordLeadActivity(supabase, {
      leadId: String(data.id),
      activityType: "created",
      description: "Lead created",
      actorUserId: user.id,
    });
  } catch {
    // Lead was created; activity logging is non-critical for V1.
  }

  return NextResponse.json({ lead: data }, { status: 201 });
}
