import { NextResponse } from "next/server";
import {
  isProposalAuthed,
  requireProposalUser,
  resolveBusinessProfile,
} from "@/lib/proposals/auth";
import { loadProposalAnalytics } from "@/lib/proposals/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
  const businessProfileId = new URL(request.url).searchParams.get("businessProfileId");
  const business = await resolveBusinessProfile(
    auth.supabase,
    auth.user,
    businessProfileId
  );
  if (!business) {
    return NextResponse.json(
      { error: "Switch to a business vault to view analytics." },
      { status: 400 }
    );
  }
  const analytics = await loadProposalAnalytics(auth.supabase, business.id);
  return NextResponse.json({ analytics });
}
