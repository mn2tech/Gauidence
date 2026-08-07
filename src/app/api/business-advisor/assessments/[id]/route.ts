import { NextResponse } from "next/server";
import {
  isProposalAuthed,
  requireProposalUser,
} from "@/lib/proposals/auth";
import { loadAssessmentDetail } from "@/lib/business-advisor/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
  const { id } = await context.params;
  const assessment = await loadAssessmentDetail(auth.supabase, id);
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found." }, { status: 404 });
  }
  return NextResponse.json({ assessment });
}
