import { NextResponse } from "next/server";
import {
  isLeadAuthed,
  requireEditableBusinessProfile,
  requireLeadUser,
} from "@/lib/leads/auth";
import { persistLeadResearch } from "@/lib/leads/research/persist";
import type { LeadResearchSnapshot } from "@/lib/leads/research/types";
import {
  getBusinessLeadById,
  loadLeadDetail,
  recordLeadActivity,
} from "@/lib/leads/server";
import { LEAD_SELECT } from "@/lib/leads/types";
import {
  parseCompanyOrContact,
  parseLeadProfileFields,
  parseLeadStatus,
  parseLeadType,
  parseOptionalText,
  parseResearchSnapshot,
} from "@/lib/leads/validators";
import { requireOwnedGuardianProfile } from "@/lib/profiles/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Get, update, or delete a single lead. */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireLeadUser();
  if (!isLeadAuthed(auth)) return auth;
  const { supabase } = auth;
  const { id } = await context.params;

  try {
    const lead = await loadLeadDetail(supabase, id);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }
    return NextResponse.json({ lead });
  } catch {
    return NextResponse.json(
      { error: "Couldn't load lead." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireLeadUser();
  if (!isLeadAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await context.params;

  const existing = await getBusinessLeadById(supabase, id);
  if (!existing) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const business = await requireEditableBusinessProfile(
    supabase,
    user.id,
    existing.business_profile_id
  );
  if (!business) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.companyName !== undefined || body.company_name !== undefined) {
    updates.company_name = parseOptionalText(
      body.companyName ?? body.company_name
    );
  }
  if (body.contactName !== undefined || body.contact_name !== undefined) {
    updates.contact_name = parseOptionalText(
      body.contactName ?? body.contact_name
    );
  }
  if (body.jobTitle !== undefined || body.job_title !== undefined) {
    updates.job_title = parseOptionalText(body.jobTitle ?? body.job_title);
  }
  if (body.email !== undefined) updates.email = parseOptionalText(body.email);
  if (body.phone !== undefined) updates.phone = parseOptionalText(body.phone);
  if (body.website !== undefined)
    updates.website = parseOptionalText(body.website);
  if (body.address !== undefined)
    updates.address = parseOptionalText(body.address);
  if (body.source !== undefined)
    updates.source = parseOptionalText(body.source);
  if (
    body.sourceDetail !== undefined ||
    body.source_detail !== undefined ||
    body.whereWeMet !== undefined
  ) {
    updates.source_detail = parseOptionalText(
      body.sourceDetail ?? body.source_detail ?? body.whereWeMet
    );
  }
  if (body.notes !== undefined) updates.notes = parseOptionalText(body.notes);

  const leadType = parseLeadType(body.leadType ?? body.lead_type);
  if (leadType) updates.lead_type = leadType;

  Object.assign(updates, parseLeadProfileFields(body));

  const newStatus = parseLeadStatus(body.status);
  if (newStatus) updates.status = newStatus;

  const mergedCompany =
    (updates.company_name as string | null | undefined) ??
    existing.company_name;
  const mergedContact =
    (updates.contact_name as string | null | undefined) ??
    existing.contact_name;
  if (!parseCompanyOrContact(mergedCompany, mergedContact)) {
    return NextResponse.json(
      { error: "Company name or contact name is required." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("business_leads")
    .update(updates)
    .eq("id", id)
    .select(LEAD_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't update lead." },
      { status: 500 }
    );
  }

  if (newStatus && newStatus !== existing.status) {
    try {
      await recordLeadActivity(supabase, {
        leadId: id,
        activityType: "status_changed",
        description: `Status changed to ${newStatus.replace(/_/g, " ")}`,
        actorUserId: user.id,
        metadata: { from: existing.status, to: newStatus },
      });
    } catch {
      // Non-critical.
    }
  }

  const snapshot = parseResearchSnapshot(
    body.researchSnapshot ?? body.research_snapshot
  ) as LeadResearchSnapshot | null;
  const alreadyStored =
    snapshot &&
    existing.last_researched_at &&
    snapshot.researchedAt === existing.last_researched_at;
  if (snapshot && !alreadyStored) {
    try {
      await persistLeadResearch(supabase, {
        leadId: id,
        businessProfileId: existing.business_profile_id,
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
        .eq("id", id);
    } catch (err) {
      console.warn("Lead research persist failed", {
        message: err instanceof Error ? err.message.slice(0, 180) : "unknown",
      });
    }
  }

  const lead = await loadLeadDetail(supabase, id);
  return NextResponse.json({ lead });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireLeadUser();
  if (!isLeadAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await context.params;

  const existing = await getBusinessLeadById(supabase, id);
  if (!existing) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const owned = await requireOwnedGuardianProfile(
    supabase,
    user.id,
    existing.business_profile_id
  );
  if (!owned) {
    return NextResponse.json(
      { error: "Only workspace owners can delete leads." },
      { status: 403 }
    );
  }

  const { error } = await supabase.from("business_leads").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Couldn't delete lead." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
