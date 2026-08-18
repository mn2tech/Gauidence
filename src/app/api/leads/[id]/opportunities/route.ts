import { NextResponse } from "next/server";
import {
  isLeadAuthed,
  requireEditableBusinessProfile,
  requireLeadUser,
} from "@/lib/leads/auth";
import {
  getBusinessLeadById,
  loadLeadDetail,
  recordLeadActivity,
} from "@/lib/leads/server";
import { LEAD_OPPORTUNITY_SELECT } from "@/lib/leads/types";
import { parseOptionalText } from "@/lib/leads/validators";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

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

  const title = parseOptionalText(body.title);
  if (!title) {
    return NextResponse.json(
      { error: "Opportunity title is required." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("lead_opportunities")
    .insert({
      business_profile_id: existing.business_profile_id,
      lead_id: id,
      title,
      agency: parseOptionalText(body.agency),
      notes: parseOptionalText(body.notes),
      status: "identified",
      created_by: user.id,
    })
    .select(LEAD_OPPORTUNITY_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't add opportunity." },
      { status: 500 }
    );
  }

  try {
    await recordLeadActivity(supabase, {
      leadId: id,
      activityType: "opportunity_discussion",
      description: `Linked opportunity: ${title}`,
      actorUserId: user.id,
    });
  } catch {
    // non-critical
  }

  const lead = await loadLeadDetail(supabase, id);
  return NextResponse.json({ opportunity: data, lead }, { status: 201 });
}
