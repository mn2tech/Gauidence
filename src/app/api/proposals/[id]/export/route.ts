import { NextResponse } from "next/server";
import { proposalExportHeaders } from "@/lib/proposals/export";
import { generateProposalPdf } from "@/lib/proposals/exportPdf";
import {
  isProposalAuthed,
  requireProposalUser,
} from "@/lib/proposals/auth";
import { getProposalById, recordProposalEvent } from "@/lib/proposals/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Download a proposal as a PDF. */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
  const { id } = await context.params;
  const proposal = await getProposalById(auth.supabase, id);
  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  const pdf = await generateProposalPdf({
    proposal,
    businessName: proposal.business_name ?? "Business",
    clientName: proposal.client_name ?? "Client",
  });

  await recordProposalEvent(auth.supabase, {
    proposalId: id,
    eventType: "exported",
    actorUserId: auth.user.id,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: proposalExportHeaders(proposal.title),
  });
}
