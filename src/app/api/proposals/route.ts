import { NextResponse } from "next/server";
import {
  isProposalAuthed,
  requireEditableBusinessProfile,
  requireProposalUser,
  resolveBusinessProfile,
} from "@/lib/proposals/auth";
import { calculateProposalPricing } from "@/lib/proposals/pricing";
import {
  clientVaultIdsForBusiness,
  enrichProposals,
  recordProposalEvent,
} from "@/lib/proposals/server";
import {
  PROPOSAL_SELECT,
  canEditProposal,
} from "@/lib/proposals/types";
import {
  parseDeliverables,
  parseExpiresAt,
  parseLineItems,
  parseProposalSearchQuery,
  parseProposalStatus,
  parseTaxRateBps,
  parseTimeline,
  parseTitle,
  parseUuid,
  parseOptionalText,
  parseCurrency,
} from "@/lib/proposals/validators";

export const runtime = "nodejs";

/** List or create proposals for a business vault. */
export async function GET(request: Request) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  const businessProfileId =
    url.searchParams.get("businessProfileId") ?? url.searchParams.get("profileId");
  const status = parseProposalStatus(url.searchParams.get("status") ?? "");
  const search = parseProposalSearchQuery(url.searchParams.get("q"));
  const clientProfileId = parseUuid(url.searchParams.get("clientProfileId"));

  const business = await resolveBusinessProfile(
    supabase,
    user,
    businessProfileId
  );
  if (!business) {
    return NextResponse.json(
      { error: "Switch to a business vault to view proposals." },
      { status: 400 }
    );
  }

  let query = supabase
    .from("proposals")
    .select(PROPOSAL_SELECT)
    .eq("business_profile_id", business.id)
    .order("updated_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (clientProfileId) query = query.eq("client_profile_id", clientProfileId);
  if (search) {
    query = query.or(
      `title.ilike.%${search}%,summary.ilike.%${search}%`
    );
  }

  const { data, error } = await query.limit(100);
  if (error) {
    return NextResponse.json(
      { error: "Couldn't load proposals." },
      { status: 500 }
    );
  }

  const proposals = await enrichProposals(supabase, data ?? []);
  return NextResponse.json({ proposals });
}

export async function POST(request: Request) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
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
  const clientProfileId = parseUuid(
    body.clientProfileId ?? body.client_profile_id
  );
  const title = parseTitle(body.title);
  if (!businessProfileId || !clientProfileId || !title) {
    return NextResponse.json(
      { error: "businessProfileId, clientProfileId, and title are required." },
      { status: 400 }
    );
  }

  const business = await requireEditableBusinessProfile(
    supabase,
    user.id,
    businessProfileId
  );
  if (!business) {
    return NextResponse.json({ error: "Business vault not found." }, { status: 404 });
  }

  const clientIds = await clientVaultIdsForBusiness(supabase, business.id);
  if (!clientIds.includes(clientProfileId)) {
    return NextResponse.json(
      { error: "Choose a client vault linked to this business." },
      { status: 400 }
    );
  }

  const lineItems = parseLineItems(body.lineItems ?? body.line_items);
  const addons = parseLineItems(body.addons);
  const taxRateBps = parseTaxRateBps(body.taxRateBps ?? body.tax_rate_bps);
  const pricing = calculateProposalPricing({
    lineItems,
    addons,
    taxRateBps,
  });

  const { data, error } = await supabase
    .from("proposals")
    .insert({
      business_profile_id: business.id,
      client_profile_id: clientProfileId,
      created_by: user.id,
      template_id: parseUuid(body.templateId ?? body.template_id),
      title,
      summary: parseOptionalText(body.summary),
      introduction: parseOptionalText(body.introduction),
      terms: parseOptionalText(body.terms),
      currency: parseCurrency(body.currency),
      tax_rate_bps: taxRateBps,
      subtotal_cents: pricing.subtotalCents,
      tax_cents: pricing.taxCents,
      total_cents: pricing.totalCents,
      line_items: lineItems,
      timeline: parseTimeline(body.timeline),
      deliverables: parseDeliverables(body.deliverables),
      addons,
      expires_at: parseExpiresAt(body.expiresAt ?? body.expires_at),
    })
    .select(PROPOSAL_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't create proposal." },
      { status: 500 }
    );
  }

  await recordProposalEvent(supabase, {
    proposalId: String(data.id),
    eventType: "created",
    actorUserId: user.id,
  });

  const [proposal] = await enrichProposals(supabase, [data]);
  return NextResponse.json({ proposal }, { status: 201 });
}
