import { NextResponse } from "next/server";
import {
  isLeadAuthed,
  requireEditableBusinessProfile,
  requireLeadUser,
  resolveBusinessProfile,
} from "@/lib/leads/auth";
import { findPotentialDuplicates } from "@/lib/leads/duplicates";
import { persistLeadResearch } from "@/lib/leads/research/persist";
import type { LeadResearchSnapshot } from "@/lib/leads/research/types";
import { recordLeadActivity, listBusinessLeads, upsertPrimaryContactFromLead } from "@/lib/leads/server";
import { LEAD_SELECT, defaultStatusForLeadType, type BusinessLead } from "@/lib/leads/types";
import {
  parseCompanyOrContact,
  parseLeadProfileFields,
  parseLeadSearchQuery,
  parseLeadStatus,
  parseLeadType,
  parseOptionalText,
  parseResearchSnapshot,
  parseUuid,
} from "@/lib/leads/validators";

export const runtime = "nodejs";

/** List or create leads for a business workspace. */
export async function GET(request: Request) {
  const auth = await requireLeadUser();
  if (!isLeadAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  const businessProfileId =
    url.searchParams.get("businessProfileId") ??
    url.searchParams.get("profileId");
  const status = parseLeadStatus(url.searchParams.get("status") ?? "");
  const search = parseLeadSearchQuery(url.searchParams.get("q"));
  const leadType = parseLeadType(url.searchParams.get("leadType") ?? url.searchParams.get("type") ?? "");
  const needsFollowUp = url.searchParams.get("followUp") === "1";

  const business = await resolveBusinessProfile(
    supabase,
    user,
    businessProfileId
  );
  if (!business) {
    return NextResponse.json(
      { error: "Switch to a business workspace to view leads." },
      { status: 400 }
    );
  }

  try {
    const leads = await listBusinessLeads(supabase, business.id, {
      status,
      search,
      leadType,
      needsFollowUp,
    });
    return NextResponse.json({ leads });
  } catch (err) {
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message?: unknown }).message ?? "")
        : err instanceof Error
          ? err.message
          : "";
    console.error("List leads failed", {
      message: message.slice(0, 240),
      code:
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: unknown }).code ?? "")
          : undefined,
    });
    const schemaBehind = /does not exist|schema cache|could not find the/i.test(
      message
    );
    return NextResponse.json(
      {
        error: schemaBehind
          ? "Couldn't load leads. Apply Supabase migrations 0071, 0072, 0087, and 0088, then reload."
          : "Couldn't load leads.",
      },
      { status: 500 }
    );
  }
}

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
  if (!businessProfileId) {
    return NextResponse.json(
      { error: "businessProfileId is required." },
      { status: 400 }
    );
  }

  const names = parseCompanyOrContact(
    body.companyName ?? body.company_name,
    body.contactName ?? body.contact_name
  );
  if (!names) {
    return NextResponse.json(
      { error: "Company name or contact name is required." },
      { status: 400 }
    );
  }

  const business = await requireEditableBusinessProfile(
    supabase,
    user.id,
    businessProfileId
  );
  if (!business) {
    return NextResponse.json(
      { error: "Business workspace not found." },
      { status: 404 }
    );
  }

  const leadType = parseLeadType(body.leadType ?? body.lead_type) ?? "commercial";
  const status = parseLeadStatus(body.status) ?? defaultStatusForLeadType(leadType);
  const forceCreate = body.forceCreate === true;
  const documentId = parseUuid(body.documentId ?? body.document_id);
  const profileFields = parseLeadProfileFields(body);

  const candidate = {
    email: parseOptionalText(body.email),
    companyName: names.companyName,
    contactName: names.contactName,
    phone: parseOptionalText(body.phone),
    website: parseOptionalText(body.website),
  };

  if (!forceCreate) {
    const duplicates = await findPotentialDuplicates(
      supabase,
      business.id,
      candidate
    );
    if (duplicates.length > 0) {
      return NextResponse.json({
        status: "duplicate_found",
        duplicates,
      }, { status: 409 });
    }
  }

  const { data, error } = await supabase
    .from("business_leads")
    .insert({
      business_profile_id: business.id,
      lead_type: leadType,
      company_name: names.companyName,
      contact_name: names.contactName,
      job_title: parseOptionalText(body.jobTitle ?? body.job_title),
      email: candidate.email,
      phone: candidate.phone,
      website: candidate.website,
      address: parseOptionalText(body.address),
      source: parseOptionalText(body.source),
      source_detail: parseOptionalText(
        body.sourceDetail ?? body.source_detail ?? body.whereWeMet
      ),
      notes: parseOptionalText(body.notes),
      status,
      document_id: documentId,
      created_by: user.id,
      last_activity_at: new Date().toISOString(),
      ...profileFields,
    })
    .select(LEAD_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't create lead." },
      { status: 500 }
    );
  }

  try {
    await recordLeadActivity(supabase, {
      leadId: String(data.id),
      activityType: "created",
      description:
        leadType === "federal_partner"
          ? "Federal partner created"
          : "Lead created",
      actorUserId: user.id,
    });
    await upsertPrimaryContactFromLead(supabase, data as BusinessLead, user.id);
  } catch {
    // Lead was created; activity logging is non-critical for V1.
  }

  const snapshot = parseResearchSnapshot(
    body.researchSnapshot ?? body.research_snapshot
  ) as LeadResearchSnapshot | null;
  if (snapshot) {
    try {
      await persistLeadResearch(supabase, {
        leadId: String(data.id),
        businessProfileId: business.id,
        userId: user.id,
        snapshot,
        applyDenormalized: false,
        overwriteRelationshipOwner: false,
      });
      await supabase
        .from("business_leads")
        .update({
          last_researched_at: snapshot.researchedAt,
          partner_fit: snapshot.partnerFit,
          research_summary: snapshot.summary,
          federal_profile_data: {
            naics: snapshot.naics,
            agencies: snapshot.agencies,
            vehicles: snapshot.vehicles,
            contracts: snapshot.contracts,
            opportunities: snapshot.opportunities,
            opportunitiesVerified: snapshot.opportunitiesVerified,
            capabilityTags: snapshot.capabilityTags,
            pastPerformanceTags: snapshot.pastPerformanceTags,
            technologyTags: snapshot.technologyTags,
            smallBusinessStatuses: snapshot.smallBusinessStatuses,
            facts: snapshot.facts,
            suggestedRelationshipOwner: snapshot.suggestedRelationshipOwner,
            checklist: snapshot.checklist,
          },
        })
        .eq("id", data.id);
    } catch (err) {
      console.warn("Lead research persist failed", {
        message: err instanceof Error ? err.message.slice(0, 180) : "unknown",
      });
    }
  }

  const { data: saved } = await supabase
    .from("business_leads")
    .select(LEAD_SELECT)
    .eq("id", data.id)
    .maybeSingle();

  return NextResponse.json({ lead: saved ?? data }, { status: 201 });
}
