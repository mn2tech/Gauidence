import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { appBaseUrl } from "@/lib/profiles/invitations";
import { pickVaultActivityRecipients } from "@/lib/vault/notifyActivity";
import { proposalPortalUrl } from "./portal";
import { sendProposalEmail } from "@/lib/email";

export type ProposalNotifyKind =
  | "sent"
  | "viewed"
  | "changes_requested"
  | "accepted"
  | "declined";

export async function notifyProposalActivity(
  _supabase: SupabaseClient,
  payload: {
    businessProfileId: string;
    actorUserId: string;
    proposalId: string;
    proposalTitle: string;
    clientName: string;
    kind: ProposalNotifyKind;
    portalToken?: string | null;
    preview?: string | null;
  }
): Promise<{ sent: number; skipped: boolean }> {
  const admin = createAdminClient();
  if (!admin) {
    console.warn("Proposal notify skipped: admin client not configured.");
    return { sent: 0, skipped: true };
  }

  const { data: members } = await admin
    .from("guardian_profile_members")
    .select("user_id, role")
    .eq("profile_id", payload.businessProfileId);

  const memberIds = (members ?? []).map((m) => String(m.user_id));
  const recipientIds = pickVaultActivityRecipients(memberIds, payload.actorUserId);

  if (recipientIds.length === 0) {
    return { sent: 0, skipped: true };
  }

  const openUrl = payload.portalToken
    ? proposalPortalUrl(payload.portalToken)
    : `${appBaseUrl()}/proposals?id=${payload.proposalId}`;

  const subjectByKind: Record<ProposalNotifyKind, string> = {
    sent: `Proposal sent to ${payload.clientName}`,
    viewed: `${payload.clientName} viewed your proposal`,
    changes_requested: `${payload.clientName} requested changes`,
    accepted: `${payload.clientName} accepted your proposal`,
    declined: `${payload.clientName} declined your proposal`,
  };

  const { data: recipients } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", recipientIds);

  let sent = 0;
  for (const recipient of recipients ?? []) {
    const email = recipient.email as string | null;
    if (!email) continue;
    const ok = await sendProposalEmail({
      to: email,
      subject: subjectByKind[payload.kind],
      heading: subjectByKind[payload.kind],
      body:
        payload.preview?.trim() ||
        `Proposal "${payload.proposalTitle}" was updated.`,
      openUrl,
    });
    if (ok) sent += 1;
  }

  return { sent, skipped: sent === 0 };
}
