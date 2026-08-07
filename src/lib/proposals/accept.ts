import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateProposalHtml } from "./export";
import { recordProposalEvent } from "./server";
import type { Proposal } from "./types";

export type ProposalAcceptResult = {
  workProjectId: string;
  contractDocumentId: string | null;
  depositInvoiceMetadata: Record<string, unknown>;
};

/** Run post-acceptance automation: project, contract stub, deposit invoice stub. */
export async function runProposalAcceptanceWorkflow(
  supabase: SupabaseClient,
  args: {
    proposal: Proposal;
    businessName: string;
    clientName: string;
    actorUserId: string;
  }
): Promise<ProposalAcceptResult> {
  const { proposal, businessName, clientName, actorUserId } = args;
  const now = new Date().toISOString();

  const { data: project, error: projectError } = await supabase
    .from("work_projects")
    .insert({
      owner_user_id: actorUserId,
      name: `${clientName}: ${proposal.title}`,
      status: "in_progress",
      mission: proposal.summary ?? proposal.title,
      current_step: "Kickoff after proposal acceptance",
      next_action: "Schedule kickoff call with client",
      profile_id: proposal.client_profile_id,
      last_activity_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (projectError || !project) {
    throw new Error("Couldn't create project from accepted proposal.");
  }

  const workProjectId = String(project.id);
  await recordProposalEvent(supabase, {
    proposalId: proposal.id,
    eventType: "project_created",
    actorUserId,
    metadata: { workProjectId },
  });

  const contractHtml = generateProposalHtml({
    proposal: {
      ...proposal,
      status: "accepted",
      terms:
        (proposal.terms ?? "") +
        "\n\nThis proposal was accepted and serves as the agreed scope of work.",
    },
    businessName,
    clientName,
  });

  let contractDocumentId: string | null = null;
  const contractFileName = `${proposal.title} — Contract.html`;
  const storagePath = `${actorUserId}/${proposal.client_profile_id}/${proposal.id}-contract.html`;
  const contractBlob = Buffer.from(contractHtml, "utf8");

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, contractBlob, {
      contentType: "text/html",
      upsert: true,
    });

  if (!uploadError) {
    const { data: contractDoc, error: contractError } = await supabase
      .from("documents")
      .insert({
        user_id: actorUserId,
        profile_id: proposal.client_profile_id,
        file_name: contractFileName,
        file_path: storagePath,
        mime_type: "text/html",
        size_bytes: contractBlob.byteLength,
        analysis_status: "skipped",
        source_text: contractHtml,
      })
      .select("id")
      .single();

    if (!contractError && contractDoc) {
      contractDocumentId = String(contractDoc.id);
      await recordProposalEvent(supabase, {
        proposalId: proposal.id,
        eventType: "contract_generated",
        actorUserId,
        metadata: { documentId: contractDocumentId },
      });
    }
  }

  const depositPercent = 25;
  const depositAmountCents = Math.round(
    (proposal.total_cents * depositPercent) / 100
  );
  const depositInvoiceMetadata = {
    kind: "deposit_invoice_stub",
    proposalId: proposal.id,
    amountCents: depositAmountCents,
    currency: proposal.currency,
    percent: depositPercent,
    status: "pending_stripe_integration",
    createdAt: now,
  };

  await recordProposalEvent(supabase, {
    proposalId: proposal.id,
    eventType: "deposit_invoice_generated",
    actorUserId,
    metadata: depositInvoiceMetadata,
  });

  return {
    workProjectId,
    contractDocumentId,
    depositInvoiceMetadata,
  };
}
