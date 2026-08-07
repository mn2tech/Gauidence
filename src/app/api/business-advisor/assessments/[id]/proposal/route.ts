import { NextResponse } from "next/server";
import {
  isProposalAuthed,
  requireProposalUser,
} from "@/lib/proposals/auth";
import {
  createProposalFromAssessment,
  loadAssessmentDetail,
} from "@/lib/business-advisor/server";
import { parseUuid } from "@/lib/proposals/validators";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
  const { id } = await context.params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }

  const existing = await loadAssessmentDetail(auth.supabase, id);
  if (!existing) {
    return NextResponse.json({ error: "Assessment not found." }, { status: 404 });
  }

  const clientProfileId =
    parseUuid(body.clientProfileId ?? body.client_profile_id) ??
    existing.client_profile_id;

  if (!clientProfileId) {
    return NextResponse.json(
      { error: "Choose a client vault for this proposal." },
      { status: 400 }
    );
  }

  if (existing.proposal_id) {
    return NextResponse.json({
      proposalId: existing.proposal_id,
      alreadyExists: true,
    });
  }

  try {
    const { proposalId } = await createProposalFromAssessment(auth.supabase, {
      assessmentId: id,
      userId: auth.user.id,
      clientProfileId,
    });
    return NextResponse.json({ proposalId });
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
