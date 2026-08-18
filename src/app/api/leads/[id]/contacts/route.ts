import { NextResponse } from "next/server";
import {
  isLeadAuthed,
  requireEditableBusinessProfile,
  requireLeadUser,
} from "@/lib/leads/auth";
import {
  getBusinessLeadById,
  loadLeadContacts,
  loadLeadDetail,
  recordLeadActivity,
  syncLeadPrimaryContactFields,
} from "@/lib/leads/server";
import { LEAD_CONTACT_SELECT } from "@/lib/leads/types";
import { parseOptionalText } from "@/lib/leads/validators";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireLeadUser();
  if (!isLeadAuthed(auth)) return auth;
  const { supabase } = auth;
  const { id } = await context.params;
  const lead = await getBusinessLeadById(supabase, id);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }
  const contacts = await loadLeadContacts(supabase, id);
  return NextResponse.json({ contacts });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireLeadUser();
  if (!isLeadAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await context.params;

  const existing = await getBusinessLeadById(supabase, id);
  if (!existing) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }
  const business = await requireEditableBusinessProfile(
    supabase,
    user.id,
    existing.business_profile_id
  );
  if (!business) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fullName = parseOptionalText(body.fullName ?? body.full_name ?? body.name);
  if (!fullName) {
    return NextResponse.json({ error: "Contact name is required." }, { status: 400 });
  }

  const isPrimary = body.isPrimary === true || body.is_primary === true;
  if (isPrimary) {
    await supabase
      .from("lead_contacts")
      .update({ is_primary: false })
      .eq("lead_id", id);
  }

  const { data, error } = await supabase
    .from("lead_contacts")
    .insert({
      lead_id: id,
      full_name: fullName,
      job_title: parseOptionalText(body.jobTitle ?? body.job_title),
      email: parseOptionalText(body.email),
      phone: parseOptionalText(body.phone),
      linkedin_url: parseOptionalText(body.linkedinUrl ?? body.linkedin_url),
      notes: parseOptionalText(body.notes),
      is_primary: isPrimary,
      created_by: user.id,
    })
    .select(LEAD_CONTACT_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Couldn't add contact." }, { status: 500 });
  }

  if (isPrimary) {
    await syncLeadPrimaryContactFields(supabase, id);
  }

  try {
    await recordLeadActivity(supabase, {
      leadId: id,
      activityType: "note",
      description: `Added contact ${fullName}`,
      actorUserId: user.id,
      contactId: data.id as string,
    });
  } catch {
    // non-critical
  }

  const lead = await loadLeadDetail(supabase, id);
  return NextResponse.json({ contact: data, lead }, { status: 201 });
}
