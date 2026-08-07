import { NextResponse } from "next/server";
import { generateProposalHtml } from "@/lib/proposals/export";
import {
  isProposalAuthed,
  requireProposalUser,
} from "@/lib/proposals/auth";
import { getProposalById, recordProposalEvent } from "@/lib/proposals/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Export a proposal as printable HTML (PDF via browser print). */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
  const { id } = await context.params;
  const proposal = await getProposalById(auth.supabase, id);
  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  const html = generateProposalHtml({
    proposal,
    businessName: proposal.business_name ?? "Business",
    clientName: proposal.client_name ?? "Client",
  });

  await recordProposalEvent(auth.supabase, {
    proposalId: id,
    eventType: "exported",
    actorUserId: auth.user.id,
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="${proposal.title.replace(/[^\w.-]+/g, "_")}.html"`,
    },
  });
}
