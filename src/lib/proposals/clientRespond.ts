import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { runProposalAcceptanceWorkflow } from "@/lib/proposals/accept";
import { notifyProposalActivity } from "@/lib/proposals/notify";
import {
  enrichProposals,
  recordProposalEvent,
} from "@/lib/proposals/server";
import { PROPOSAL_SELECT, type ProposalWithMeta } from "@/lib/proposals/types";
import { parseOptionalText } from "@/lib/proposals/validators";
import { requireAccessibleGuardianProfile } from "@/lib/profiles/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function userCanAccessProposalAsClient(
  supabase: SupabaseClient,
  userId: string,
  proposal: ProposalWithMeta
): Promise<boolean> {
  if (proposal.status === "draft") return false;
  const profile = await requireAccessibleGuardianProfile(
    supabase,
    userId,
    proposal.client_profile_id
  );
  return profile?.profile_type === "client";
}

export async function recordAuthenticatedProposalView(
  proposal: ProposalWithMeta,
  actorUserId: string | null
): Promise<ProposalWithMeta> {
  const admin = createAdminClient();
  if (!admin) return proposal;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    last_viewed_at: now,
    status: proposal.status === "sent" ? "viewed" : proposal.status,
  };
  if (!proposal.first_viewed_at) patch.first_viewed_at = now;

  await admin.from("proposals").update(patch).eq("id", proposal.id);
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
  return updated ?? proposal;
}

export async function respondToProposalAsClient(
  supabase: SupabaseClient,
  user: User,
  proposal: ProposalWithMeta,
  args: {
    action: "view" | "accept" | "decline" | "request_changes";
    clientFeedback?: string | null;
  }
): Promise<ProposalWithMeta> {
  const allowed = await userCanAccessProposalAsClient(
    supabase,
    user.id,
    proposal
  );
  if (!allowed) {
    throw new Error("You don't have access to this proposal.");
  }

  if (args.action === "view") {
    return recordAuthenticatedProposalView(proposal, user.id);
  }

  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Proposal actions aren't configured on this deployment.");
  }

  if (args.action === "accept") {
    if (proposal.status === "accepted") return proposal;
    const result = await runProposalAcceptanceWorkflow(admin, {
      proposal,
      businessName: proposal.business_name ?? "Business",
      clientName: proposal.client_name ?? "Client",
      actorUserId: user.id,
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
      throw new Error("Couldn't accept proposal.");
    }
    await recordProposalEvent(admin, {
      proposalId: proposal.id,
      eventType: "accepted",
      actorUserId: user.id,
      metadata: result,
    });
    void notifyProposalActivity(admin, {
      businessProfileId: proposal.business_profile_id,
      actorUserId: user.id,
      proposalId: proposal.id,
      proposalTitle: proposal.title,
      clientName: proposal.client_name ?? "Client",
      kind: "accepted",
    });
    const [updated] = await enrichProposals(admin, [data]);
    return updated;
  }

  if (args.action === "decline") {
    const feedback = parseOptionalText(args.clientFeedback);
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
      throw new Error("Couldn't decline proposal.");
    }
    await recordProposalEvent(admin, {
      proposalId: proposal.id,
      eventType: "declined",
      actorUserId: user.id,
      metadata: feedback ? { feedback } : {},
    });
    void notifyProposalActivity(admin, {
      businessProfileId: proposal.business_profile_id,
      actorUserId: user.id,
      proposalId: proposal.id,
      proposalTitle: proposal.title,
      clientName: proposal.client_name ?? "Client",
      kind: "declined",
      preview: feedback ?? undefined,
    });
    const [updated] = await enrichProposals(admin, [data]);
    return updated;
  }

  const feedback = parseOptionalText(args.clientFeedback);
  if (!feedback) {
    throw new Error("Describe the changes you'd like.");
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
    throw new Error("Couldn't save change request.");
  }
  await recordProposalEvent(admin, {
    proposalId: proposal.id,
    eventType: "changes_requested",
    actorUserId: user.id,
    metadata: { feedback },
  });
  void notifyProposalActivity(admin, {
    businessProfileId: proposal.business_profile_id,
    actorUserId: user.id,
    proposalId: proposal.id,
    proposalTitle: proposal.title,
    clientName: proposal.client_name ?? "Client",
    kind: "changes_requested",
    preview: feedback,
  });
  const [updated] = await enrichProposals(admin, [data]);
  return updated;
}
