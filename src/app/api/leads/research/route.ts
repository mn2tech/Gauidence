import { NextResponse } from "next/server";
import { assertBillingQuota, recordChatEvent } from "@/lib/billing/quota";
import {
  isLeadAuthed,
  requireEditableBusinessProfile,
  requireLeadUser,
} from "@/lib/leads/auth";
import { runLeadCompanyResearch } from "@/lib/leads/research/runResearch";
import { getBusinessLeadById } from "@/lib/leads/server";
import { parseOptionalText, parseUuid } from "@/lib/leads/validators";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Research a company and return a preview. Does not save the lead. */
export async function POST(request: Request) {
  const auth = await requireLeadUser();
  if (!isLeadAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const businessProfileId = parseUuid(
    body.businessProfileId ?? body.business_profile_id
  );
  const companyName = parseOptionalText(body.companyName ?? body.company_name) ?? "";
  const website = parseOptionalText(body.website) ?? "";
  if (!businessProfileId) {
    return NextResponse.json(
      { error: "businessProfileId is required." },
      { status: 400 }
    );
  }
  if (!companyName && !website) {
    return NextResponse.json(
      { error: "Enter a company name or website to research." },
      { status: 400 }
    );
  }

  const business = await requireEditableBusinessProfile(
    supabase,
    user.id,
    businessProfileId
  );
  if (!business) {
    return NextResponse.json({ error: "Business workspace not found." }, { status: 404 });
  }

  const leadId = parseUuid(body.leadId ?? body.lead_id);
  if (leadId) {
    const existing = await getBusinessLeadById(supabase, leadId);
    if (!existing || existing.business_profile_id !== businessProfileId) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }
  }

  const quota = await assertBillingQuota(
    supabase,
    user.id,
    "research",
    user.email
  );
  if (!quota.ok) return quota.response;

  const { error: eventError } = await recordChatEvent(
    supabase,
    user.id,
    "research"
  );
  if (eventError) {
    return NextResponse.json(
      { error: "We couldn't start research. Please try again." },
      { status: 502 }
    );
  }

  try {
    const result = await runLeadCompanyResearch({
      supabase,
      userId: user.id,
      businessProfileId,
      companyName,
      website,
      mode: body.mode === "refresh" ? "refresh" : "full",
      selectedUei: parseOptionalText(body.selectedUei ?? body.uei),
      selectedHash: parseOptionalText(body.selectedHash),
      selectedLegalName: parseOptionalText(body.selectedLegalName),
    });
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't research this company.";
    console.error("Lead research failed:", message.slice(0, 240));
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
