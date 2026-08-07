import { NextResponse } from "next/server";
import {
  isProposalAuthed,
  requireEditableBusinessProfile,
  requireProposalUser,
  resolveBusinessProfile,
} from "@/lib/proposals/auth";
import { loadAssessmentDetail } from "@/lib/business-advisor/server";
import { ASSESSMENT_SELECT } from "@/lib/business-advisor/types";
import { parseUuid, parseTitle } from "@/lib/proposals/validators";

export const runtime = "nodejs";
export const maxDuration = 120;

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

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
    return NextResponse.json({ error: "Business vault required." }, { status: 400 });
  }
  const { data, error } = await auth.supabase
    .from("business_assessments")
    .select(ASSESSMENT_SELECT)
    .eq("business_profile_id", business.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: "Couldn't load assessments." }, { status: 500 });
  }
  return NextResponse.json({ assessments: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const businessProfileId = parseUuid(
    body.businessProfileId ?? body.business_profile_id
  );
  const companyName = parseTitle(body.companyName ?? body.company_name, 200);
  const websiteUrl = normalizeUrl(body.websiteUrl ?? body.website_url);
  const clientProfileId = parseUuid(body.clientProfileId ?? body.client_profile_id);

  if (!businessProfileId || !companyName || !websiteUrl) {
    return NextResponse.json(
      { error: "businessProfileId, companyName, and websiteUrl are required." },
      { status: 400 }
    );
  }

  const business = await requireEditableBusinessProfile(
    auth.supabase,
    auth.user.id,
    businessProfileId
  );
  if (!business) {
    return NextResponse.json({ error: "Business vault not found." }, { status: 404 });
  }

  const { data, error } = await auth.supabase
    .from("business_assessments")
    .insert({
      business_profile_id: business.id,
      client_profile_id: clientProfileId,
      created_by: auth.user.id,
      company_name: companyName,
      website_url: websiteUrl,
      status: "draft",
    })
    .select(ASSESSMENT_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't create assessment." },
      { status: 500 }
    );
  }
  return NextResponse.json({ assessment: data }, { status: 201 });
}
