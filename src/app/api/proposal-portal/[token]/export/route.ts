import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { proposalExportHeaders } from "@/lib/proposals/export";
import { generateProposalPdf } from "@/lib/proposals/exportPdf";
import { hashProposalPortalToken } from "@/lib/proposals/portal";
import { enrichProposals, recordProposalEvent } from "@/lib/proposals/server";
import { PROPOSAL_SELECT } from "@/lib/proposals/types";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };

/** Download a shared proposal as a PDF. */
export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  const hash = hashProposalPortalToken(token);
  const { data } = await admin
    .from("proposals")
    .select(PROPOSAL_SELECT)
    .eq("portal_token_hash", hash)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }
  if (
    data.portal_token_expires_at &&
    new Date(String(data.portal_token_expires_at)).getTime() < Date.now()
  ) {
    return NextResponse.json(
      { error: "This proposal link has expired." },
      { status: 410 }
    );
  }

  const [proposal] = await enrichProposals(admin, [data]);
  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  const supabase = await createClient();
  const actorUserId =
    supabase != null
      ? (await supabase.auth.getUser()).data.user?.id ?? null
      : null;

  await recordProposalEvent(admin, {
    proposalId: proposal.id,
    eventType: "exported",
    actorUserId,
  });

  const pdf = await generateProposalPdf({
    proposal,
    businessName: proposal.business_name ?? "Business",
    clientName: proposal.client_name ?? "Client",
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: proposalExportHeaders(proposal.title),
  });
}
