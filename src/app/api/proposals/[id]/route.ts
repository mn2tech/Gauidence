import { NextResponse } from "next/server";
import { runProposalAcceptanceWorkflow } from "@/lib/proposals/accept";
import {
  isProposalAuthed,
  requireEditableBusinessProfile,
  requireProposalUser,
} from "@/lib/proposals/auth";
import {
  respondToProposalAsClient,
  userCanAccessProposalAsClient,
} from "@/lib/proposals/clientRespond";
import { notifyProposalActivity } from "@/lib/proposals/notify";
import { calculateProposalPricing } from "@/lib/proposals/pricing";
import {
  generateProposalPortalToken,
  defaultPortalExpiry,
} from "@/lib/proposals/portal";
import {
  enrichProposals,
  getProposalById,
  recordProposalEvent,
} from "@/lib/proposals/server";
import {
  PROPOSAL_SELECT,
  canEditProposal,
  canSendProposal,
  isTerminalProposalStatus,
} from "@/lib/proposals/types";
import {
  parseDeliverables,
  parseExpiresAt,
  parseLineItems,
  parseOptionalText,
  parseProposalStatus,
  parseTaxRateBps,
  parseTimeline,
  parseTitle,
  parseCurrency,
} from "@/lib/proposals/validators";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
  const { id } = await context.params;
  const proposal = await getProposalById(auth.supabase, id);
  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }
  return NextResponse.json({ proposal });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await context.params;

  const existing = await getProposalById(supabase, id);
  if (!existing) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const businessEditor = await requireEditableBusinessProfile(
    supabase,
    user.id,
    existing.business_profile_id
  );
  const clientActions = new Set([
    "view",
    "accept",
    "decline",
    "request_changes",
  ]);

  if (!businessEditor && clientActions.has(action)) {
    try {
      const proposal = await respondToProposalAsClient(supabase, user, existing, {
        action: action as "view" | "accept" | "decline" | "request_changes",
        clientFeedback: parseOptionalText(
          body.clientFeedback ?? body.client_feedback
        ),
      });
      return NextResponse.json({ proposal });
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error ? err.message : "Couldn't update proposal.",
        },
        { status: err instanceof Error && err.message.includes("access") ? 403 : 400 }
      );
    }
  }

  if (action === "send") {
    if (!canSendProposal(existing.status)) {
      return NextResponse.json(
        { error: "This proposal can't be sent in its current status." },
        { status: 400 }
      );
    }
    const { token, hash } = generateProposalPortalToken();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("proposals")
      .update({
        status: "sent",
        sent_at: now,
        portal_token_hash: hash,
        portal_token_expires_at: defaultPortalExpiry(),
      })
      .eq("id", id)
      .select(PROPOSAL_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Couldn't send proposal." }, { status: 500 });
    }
    await recordProposalEvent(supabase, {
      proposalId: id,
      eventType: "sent",
      actorUserId: user.id,
    });
    void notifyProposalActivity(supabase, {
      businessProfileId: existing.business_profile_id,
      actorUserId: user.id,
      proposalId: id,
      proposalTitle: existing.title,
      clientName: existing.client_name ?? "Client",
      kind: "sent",
      portalToken: token,
    });
    const [proposal] = await enrichProposals(supabase, [data]);
    return NextResponse.json({ proposal, portalToken: token });
  }

  if (action === "share") {
    const canShareAsClient = await userCanAccessProposalAsClient(
      supabase,
      user.id,
      existing
    );
    if (!businessEditor && !canShareAsClient) {
      return NextResponse.json(
        { error: "You don't have permission to share this proposal." },
        { status: 403 }
      );
    }
    if (existing.status === "draft") {
      return NextResponse.json(
        { error: "Send the proposal first, then share the client link." },
        { status: 400 }
      );
    }
    const { token, hash } = generateProposalPortalToken();
    const patch: Record<string, unknown> = {
      portal_token_hash: hash,
      portal_token_expires_at: defaultPortalExpiry(),
    };
    if (existing.status === "expired") {
      patch.status = "sent";
      patch.sent_at = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from("proposals")
      .update(patch)
      .eq("id", id)
      .select(PROPOSAL_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: "Couldn't create share link." },
        { status: 500 }
      );
    }
    const [proposal] = await enrichProposals(supabase, [data]);
    return NextResponse.json({ proposal, portalToken: token });
  }

  if (action === "accept") {
    if (existing.status === "accepted") {
      return NextResponse.json({ proposal: existing });
    }
    const result = await runProposalAcceptanceWorkflow(supabase, {
      proposal: existing,
      businessName: existing.business_name ?? "Business",
      clientName: existing.client_name ?? "Client",
      actorUserId: user.id,
    });
    const { data, error } = await supabase
      .from("proposals")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        work_project_id: result.workProjectId,
        document_id: result.contractDocumentId,
        external_metadata: {
          ...existing.external_metadata,
          depositInvoice: result.depositInvoiceMetadata,
        },
      })
      .eq("id", id)
      .select(PROPOSAL_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: "Couldn't accept proposal." },
        { status: 500 }
      );
    }
    await recordProposalEvent(supabase, {
      proposalId: id,
      eventType: "accepted",
      actorUserId: user.id,
      metadata: result,
    });
    void notifyProposalActivity(supabase, {
      businessProfileId: existing.business_profile_id,
      actorUserId: user.id,
      proposalId: id,
      proposalTitle: existing.title,
      clientName: existing.client_name ?? "Client",
      kind: "accepted",
    });
    const [proposal] = await enrichProposals(supabase, [data]);
    return NextResponse.json({ proposal, acceptance: result });
  }

  if (action === "decline") {
    const feedback = parseOptionalText(body.clientFeedback ?? body.client_feedback);
    const { data, error } = await supabase
      .from("proposals")
      .update({
        status: "declined",
        declined_at: new Date().toISOString(),
        client_feedback: feedback,
      })
      .eq("id", id)
      .select(PROPOSAL_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Couldn't decline proposal." }, { status: 500 });
    }
    await recordProposalEvent(supabase, {
      proposalId: id,
      eventType: "declined",
      actorUserId: user.id,
      metadata: feedback ? { feedback } : {},
    });
    void notifyProposalActivity(supabase, {
      businessProfileId: existing.business_profile_id,
      actorUserId: user.id,
      proposalId: id,
      proposalTitle: existing.title,
      clientName: existing.client_name ?? "Client",
      kind: "declined",
      preview: feedback ?? undefined,
    });
    const [proposal] = await enrichProposals(supabase, [data]);
    return NextResponse.json({ proposal });
  }

  if (action === "request_changes") {
    const feedback = parseOptionalText(body.clientFeedback ?? body.client_feedback);
    if (!feedback) {
      return NextResponse.json(
        { error: "Describe the changes you'd like." },
        { status: 400 }
      );
    }
    const { data, error } = await supabase
      .from("proposals")
      .update({
        status: "changes_requested",
        client_feedback: feedback,
      })
      .eq("id", id)
      .select(PROPOSAL_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: "Couldn't save change request." },
        { status: 500 }
      );
    }
    await recordProposalEvent(supabase, {
      proposalId: id,
      eventType: "changes_requested",
      actorUserId: user.id,
      metadata: { feedback },
    });
    void notifyProposalActivity(supabase, {
      businessProfileId: existing.business_profile_id,
      actorUserId: user.id,
      proposalId: id,
      proposalTitle: existing.title,
      clientName: existing.client_name ?? "Client",
      kind: "changes_requested",
      preview: feedback,
    });
    const [proposal] = await enrichProposals(supabase, [data]);
    return NextResponse.json({ proposal });
  }

  if (!canEditProposal(existing.status)) {
    return NextResponse.json(
      { error: "This proposal can't be edited in its current status." },
      { status: 400 }
    );
  }

  const lineItems = body.lineItems != null || body.line_items != null
    ? parseLineItems(body.lineItems ?? body.line_items)
    : existing.line_items;
  const addons =
    body.addons != null ? parseLineItems(body.addons) : existing.addons;
  const taxRateBps =
    body.taxRateBps != null || body.tax_rate_bps != null
      ? parseTaxRateBps(body.taxRateBps ?? body.tax_rate_bps)
      : existing.tax_rate_bps;
  const pricing = calculateProposalPricing({ lineItems, addons, taxRateBps });

  const patch: Record<string, unknown> = {
    subtotal_cents: pricing.subtotalCents,
    tax_cents: pricing.taxCents,
    total_cents: pricing.totalCents,
    line_items: lineItems,
    addons,
    tax_rate_bps: taxRateBps,
  };
  if (body.title != null) {
    const title = parseTitle(body.title);
    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }
    patch.title = title;
  }
  if (body.summary !== undefined) patch.summary = parseOptionalText(body.summary);
  if (body.introduction !== undefined) {
    patch.introduction = parseOptionalText(body.introduction);
  }
  if (body.terms !== undefined) patch.terms = parseOptionalText(body.terms);
  if (body.timeline != null) patch.timeline = parseTimeline(body.timeline);
  if (body.deliverables != null) {
    patch.deliverables = parseDeliverables(body.deliverables);
  }
  if (body.currency != null) patch.currency = parseCurrency(body.currency);
  if (body.expiresAt !== undefined || body.expires_at !== undefined) {
    patch.expires_at = parseExpiresAt(body.expiresAt ?? body.expires_at);
  }
  const nextStatus = parseProposalStatus(body.status);
  if (nextStatus && !isTerminalProposalStatus(existing.status)) {
    patch.status = nextStatus;
  }

  const { data, error } = await supabase
    .from("proposals")
    .update(patch)
    .eq("id", id)
    .select(PROPOSAL_SELECT)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Couldn't update proposal." }, { status: 500 });
  }
  await recordProposalEvent(supabase, {
    proposalId: id,
    eventType: "updated",
    actorUserId: user.id,
  });
  const [proposal] = await enrichProposals(supabase, [data]);
  return NextResponse.json({ proposal });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await context.params;
  const existing = await getProposalById(supabase, id);
  if (!existing) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }
  const business = await requireEditableBusinessProfile(
    supabase,
    user.id,
    existing.business_profile_id
  );
  if (!business) {
    return NextResponse.json(
      { error: "You don't have permission to delete this proposal." },
      { status: 403 }
    );
  }
  const { error } = await supabase.from("proposals").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Couldn't delete proposal." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
