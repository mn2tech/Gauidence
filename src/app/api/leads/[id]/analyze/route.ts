import { NextResponse } from "next/server";
import {
  isLeadAuthed,
  requireEditableBusinessProfile,
  requireLeadUser,
} from "@/lib/leads/auth";
import { runLeadOpportunityAnalysis } from "@/lib/leads/analyze";
import { getBusinessLeadById, loadLeadDetail } from "@/lib/leads/server";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

/** Run Gideon opportunity analysis for a lead. */
export async function POST(_request: Request, context: RouteContext) {
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

  try {
    const { brief } = await runLeadOpportunityAnalysis(supabase, {
      leadId: id,
      userId: user.id,
      userEmail: user.email,
    });
    const lead = await loadLeadDetail(supabase, id);
    return NextResponse.json({ lead, brief });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Couldn't analyze this lead. Try again.",
      },
      { status: 502 }
    );
  }
}
