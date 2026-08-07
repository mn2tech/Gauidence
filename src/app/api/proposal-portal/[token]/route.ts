import { NextResponse } from "next/server";
import { runProposalAcceptanceWorkflow } from "@/lib/proposals/accept";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashProposalPortalToken } from "@/lib/proposals/portal";
import { enrichProposals, recordProposalEvent } from "@/lib/proposals/server";
import { PROPOSAL_SELECT } from "@/lib/proposals/types";
import { notifyProposalActivity } from "@/lib/proposals/notify";
import { createClient } from "@/lib/supabase/server";
import { parseOptionalText } from "@/lib/proposals/validators";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };

async function loadProposalByToken(token: string) {
  const admin = createAdminClient();
  if (!admin) return null;
  const hash = hashProposalPortalToken(token);
  const { data } = await admin
    .from("proposals")
    .select(PROPOSAL_SELECT)
    .eq("portal_token_hash", hash)
    .maybeSingle();
  if (!data) return null;
  if (
    data.portal_token_expires_at &&
    new Date(String(data.portal_token_expires_at)).getTime() < Date.now()
  ) {
    return { expired: true as const };
  }
  const [proposal] = await enrichProposals(admin, [data]);
  return { proposal: proposal ?? null, admin, row: data };
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const loaded = await loadProposalByToken(token);
  if (!loaded) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }
  if ("expired" in loaded) {
    return NextResponse.json({ error: "This proposal link has expired." }, { status: 410 });
  }
  if (!loaded.proposal) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }
  return NextResponse.json({ proposal: loaded.proposal });
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const loaded = await loadProposalByToken(token);
  if (!loaded || "expired" in loaded || !loaded.proposal) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }
  const { proposal, admin } = loaded;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action.trim() : "view";

  const supabase = await createClient();
  const actorUserId =
    supabase != null
      ? (await supabase.auth.getUser()).data.user?.id ?? null
      : null;

  if (action === "view") {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      last_viewed_at: now,
      status: proposal.status === "sent" ? "viewed" : proposal.status,
    };
    if (!proposal.first_viewed_at) patch.first_viewed_at = now;
    await admin
      .from("proposals")
      .update(patch)
      .eq("id", proposal.id);
    await recordProposalEvent(admin, {
      proposalId: proposal.id,
      eventType: "viewed",
      actorUserId,
    });
    if (proposal.status === "sent") {
      void notifyProposalActivity(admin, {
        businessProfileId: proposal.business_profile_id,
        actorUserId: actorUserId ?? proposal.created_by,
        proposalId: proposal.id,
        proposalTitle: proposal.title,
        clientName: proposal.client_name ?? "Client",
        kind: "viewed",
      });
    }
    const { data } = await admin
      .from("proposals")
      .select(PROPOSAL_SELECT)
      .eq("id", proposal.id)
      .single();
    const [updated] = data ? await enrichProposals(admin, [data]) : [proposal];
    return NextResponse.json({ proposal: updated });
  }

  if (action === "accept") {
    const result = await runProposalAcceptanceWorkflow(admin, {
      proposal,
      businessName: proposal.business_name ?? "Business",
      clientName: proposal.client_name ?? "Client",
      actorUserId: proposal.created_by,
    });
    const { data, error } = await admin
      .from("proposals")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        work_project_id: result.workProjectId,
        document_id: result.contractDocumentId,
        external_metadata: {
          ...proposal.external_metadata,
          depositInvoice: result.depositInvoiceMetadata,
        },
      })
      .eq("id", proposal.id)
      .select(PROPOSAL_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Couldn't accept proposal." }, { status: 500 });
    }
    await recordProposalEvent(admin, {
      proposalId: proposal.id,
      eventType: "accepted",
      actorUserId,
      metadata: result,
    });
    void notifyProposalActivity(admin, {
      businessProfileId: proposal.business_profile_id,
      actorUserId: actorUserId ?? proposal.created_by,
      proposalId: proposal.id,
      proposalTitle: proposal.title,
      clientName: proposal.client_name ?? "Client",
      kind: "accepted",
    });
    const [updated] = await enrichProposals(admin, [data]);
    return NextResponse.json({ proposal: updated, acceptance: result });
  }

  if (action === "decline") {
    const feedback = parseOptionalText(body.clientFeedback ?? body.feedback);
    const { data, error } = await admin
      .from("proposals")
      .update({
        status: "declined",
        declined_at: new Date().toISOString(),
        client_feedback: feedback,
      })
      .eq("id", proposal.id)
      .select(PROPOSAL_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Couldn't decline proposal." }, { status: 500 });
    }
    await recordProposalEvent(admin, {
      proposalId: proposal.id,
      eventType: "declined",
      actorUserId,
      metadata: feedback ? { feedback } : {},
    });
    void notifyProposalActivity(admin, {
      businessProfileId: proposal.business_profile_id,
      actorUserId: actorUserId ?? proposal.created_by,
      proposalId: proposal.id,
      proposalTitle: proposal.title,
      clientName: proposal.client_name ?? "Client",
      kind: "declined",
      preview: feedback ?? undefined,
    });
    const [updated] = await enrichProposals(admin, [data]);
    return NextResponse.json({ proposal: updated });
  }

  if (action === "request_changes") {
    const feedback = parseOptionalText(body.clientFeedback ?? body.feedback);
    if (!feedback) {
      return NextResponse.json(
        { error: "Describe the changes you'd like." },
        { status: 400 }
      );
    }
    const { data, error } = await admin
      .from("proposals")
      .update({
        status: "changes_requested",
        client_feedback: feedback,
      })
      .eq("id", proposal.id)
      .select(PROPOSAL_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: "Couldn't save change request." },
        { status: 500 }
      );
    }
    await recordProposalEvent(admin, {
      proposalId: proposal.id,
      eventType: "changes_requested",
      actorUserId,
      metadata: { feedback },
    });
    void notifyProposalActivity(admin, {
      businessProfileId: proposal.business_profile_id,
      actorUserId: actorUserId ?? proposal.created_by,
      proposalId: proposal.id,
      proposalTitle: proposal.title,
      clientName: proposal.client_name ?? "Client",
      kind: "changes_requested",
      preview: feedback,
    });
    const [updated] = await enrichProposals(admin, [data]);
    return NextResponse.json({ proposal: updated });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
