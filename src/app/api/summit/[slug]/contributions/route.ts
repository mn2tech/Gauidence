import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireSummitAdmin } from "@/lib/summit-space/adminAccess";
import { buildDefaultApprovedEntities } from "@/lib/summit-space/communityExtract";
import {
  contributionStatusCounts,
  stripPrivateContributionFields,
  type CommunityExtractionResult,
  type SummitCommunityContributionRow,
} from "@/lib/summit-space/contributions";
import { publishCommunityContribution } from "@/lib/summit-space/publishContribution";
import type { ApprovedEntitySpec } from "@/lib/summit-space/contributions";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * Owner/admin — list all contributions with counts.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const supabase = await createClient();
  const auth = await requireSummitAdmin(supabase, slug);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const { data: rows } = await admin
    .from("summit_community_contributions")
    .select("*")
    .eq("summit_slug", slug)
    .order("created_at", { ascending: false });

  const contributions = (rows ?? []) as SummitCommunityContributionRow[];
  const counts = contributionStatusCounts(contributions);

  const safeContributions = await Promise.all(
    contributions.map(async (row) => {
      const safe = stripPrivateContributionFields(row);
      let fileUrl: string | null = null;
      if (row.file_path) {
        const { data } = await admin.storage
          .from("summit-contributions")
          .createSignedUrl(row.file_path, 3600);
        fileUrl = data?.signedUrl ?? null;
      }
      return { ...safe, fileUrl };
    })
  );

  return NextResponse.json({ contributions: safeContributions, counts });
}

/**
 * Owner/admin — approve, reject, or publish contributions.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const supabase = await createClient();
  const auth = await requireSummitAdmin(supabase, slug);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    contributionId?: string;
    action?: "approve" | "reject" | "publish";
    approvedEntities?: ApprovedEntitySpec[];
    publishedSummary?: string;
    rejectionReason?: string;
  };

  if (!body.contributionId || !body.action) {
    return NextResponse.json(
      { error: "Missing contributionId or action" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const { data: contribution } = await admin
    .from("summit_community_contributions")
    .select("*")
    .eq("id", body.contributionId)
    .eq("summit_slug", slug)
    .maybeSingle();

  if (!contribution) {
    return NextResponse.json({ error: "Contribution not found" }, { status: 404 });
  }

  const row = contribution as SummitCommunityContributionRow;
  const now = new Date().toISOString();

  if (body.action === "reject") {
    const { data: updated } = await admin
      .from("summit_community_contributions")
      .update({
        status: "rejected",
        rejection_reason: body.rejectionReason ?? null,
        reviewed_by: auth.userId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", body.contributionId)
      .select("*")
      .single();

    return NextResponse.json({
      contribution: stripPrivateContributionFields(updated as SummitCommunityContributionRow),
    });
  }

  if (body.action === "approve") {
    const extraction = row.extracted_data as CommunityExtractionResult;
    const approvedEntities =
      body.approvedEntities ??
      buildDefaultApprovedEntities(extraction);

    const { data: updated } = await admin
      .from("summit_community_contributions")
      .update({
        status: "approved",
        approved_entities: approvedEntities,
        reviewed_by: auth.userId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", body.contributionId)
      .select("*")
      .single();

    return NextResponse.json({
      contribution: stripPrivateContributionFields(updated as SummitCommunityContributionRow),
    });
  }

  if (body.action === "publish") {
    const extraction = row.extracted_data as CommunityExtractionResult;
    const approvedEntities =
      body.approvedEntities ??
      (row.approved_entities.length > 0
        ? row.approved_entities
        : buildDefaultApprovedEntities(extraction));

    const result = await publishCommunityContribution({
      admin,
      contribution: row,
      approvedEntities,
      publishedSummary: body.publishedSummary,
      reviewedBy: auth.userId,
    });

    const { data: updated } = await admin
      .from("summit_community_contributions")
      .select("*")
      .eq("id", body.contributionId)
      .single();

    return NextResponse.json({
      contribution: stripPrivateContributionFields(updated as SummitCommunityContributionRow),
      publishedEntityIds: result.entityIds,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
