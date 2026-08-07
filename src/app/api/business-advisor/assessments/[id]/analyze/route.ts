import { NextResponse } from "next/server";
import {
  isProposalAuthed,
  requireProposalUser,
} from "@/lib/proposals/auth";
import {
  loadAssessmentDetail,
  runAssessmentAnalysis,
} from "@/lib/business-advisor/server";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
  const { id } = await context.params;

  const existing = await loadAssessmentDetail(auth.supabase, id);
  if (!existing) {
    return NextResponse.json({ error: "Assessment not found." }, { status: 404 });
  }

  try {
    const assessment = await runAssessmentAnalysis(auth.supabase, {
      assessmentId: id,
      businessProfileId: existing.business_profile_id,
      userId: auth.user.id,
    });
    return NextResponse.json({ assessment });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Analysis failed. Try again.",
      },
      { status: 502 }
    );
  }
}
