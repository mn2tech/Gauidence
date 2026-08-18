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
import { parseLeadActivityType, parseOptionalText, parseUuid } from "@/lib/leads/validators";

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

  const activityType =
    parseLeadActivityType(body.activityType ?? body.activity_type) ?? "note";
  const description = parseOptionalText(body.description ?? body.summary);
  if (!description) {
    return NextResponse.json({ error: "Summary is required." }, { status: 400 });
  }

  await recordLeadActivity(supabase, {
    leadId: id,
    activityType,
    description,
    actorUserId: user.id,
    contactId: parseUuid(body.contactId ?? body.contact_id),
    occurredAt: parseOptionalText(body.occurredAt ?? body.date) ?? undefined,
  });

  const lead = await loadLeadDetail(supabase, id);
  return NextResponse.json({ lead }, { status: 201 });
}
