import { NextResponse } from "next/server";
import {
  isLeadAuthed,
  requireEditableBusinessProfile,
  requireLeadUser,
} from "@/lib/leads/auth";
import { runLeadOutreachDraft } from "@/lib/leads/draftOutreach";
import { getBusinessLeadById } from "@/lib/leads/server";
import { loadLeadDetail } from "@/lib/leads/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

/** Generate a personalized outreach email draft (copy-only in V1). */
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  try {
    const { draft } = await runLeadOutreachDraft(supabase, {
      leadId: id,
      userId: user.id,
      userEmail: user.email,
      senderName: (profile?.full_name as string) ?? null,
    });
    const lead = await loadLeadDetail(supabase, id);
    return NextResponse.json({ lead, draft });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Couldn't draft outreach. Try again.",
      },
      { status: 502 }
    );
  }
}
