import { NextResponse } from "next/server";
import {
  isLeadAuthed,
  requireEditableBusinessProfile,
  requireLeadUser,
} from "@/lib/leads/auth";
import { createProposalFromLead } from "@/lib/leads/createProposal";
import { getBusinessLeadById, loadLeadDetail } from "@/lib/leads/server";
import { parseUuid } from "@/lib/leads/validators";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Create a draft proposal from lead opportunity context. */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireLeadUser();
  if (!isLeadAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await context.params;

  const existing = await getBusinessLeadById(supabase, id);
  if (!existing) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const editable = await requireEditableBusinessProfile(
    supabase,
    user.id,
    existing.business_profile_id
  );
  if (!editable) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }

  const clientProfileId = parseUuid(
    body.clientProfileId ?? body.client_profile_id
  );
  const templateId = parseUuid(body.templateId ?? body.template_id);

  try {
    const result = await createProposalFromLead(supabase, {
      leadId: id,
      userId: user.id,
      clientProfileId,
      templateId,
    });
    const lead = await loadLeadDetail(supabase, id);
    return NextResponse.json({
      proposalId: result.proposalId,
      alreadyExists: result.alreadyExists,
      lead,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Couldn't create proposal.",
      },
      { status: 500 }
    );
  }
}
