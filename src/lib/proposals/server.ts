import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PROPOSAL_SELECT,
  PROPOSAL_STATUSES,
  type Proposal,
  type ProposalAnalytics,
  type ProposalEventType,
  type ProposalStatus,
  type ProposalWithMeta,
} from "./types";

function mapProposalRow(row: Record<string, unknown>): Proposal {
  return {
    id: String(row.id),
    business_profile_id: String(row.business_profile_id),
    client_profile_id: String(row.client_profile_id),
    created_by: String(row.created_by),
    template_id: row.template_id ? String(row.template_id) : null,
    title: String(row.title),
    summary: (row.summary as string | null) ?? null,
    introduction: (row.introduction as string | null) ?? null,
    terms: (row.terms as string | null) ?? null,
    status: String(row.status) as ProposalStatus,
    version: Number(row.version ?? 1),
    currency: String(row.currency ?? "USD"),
    tax_rate_bps: Number(row.tax_rate_bps ?? 0),
    subtotal_cents: Number(row.subtotal_cents ?? 0),
    tax_cents: Number(row.tax_cents ?? 0),
    total_cents: Number(row.total_cents ?? 0),
    line_items: Array.isArray(row.line_items) ? row.line_items : [],
    timeline: Array.isArray(row.timeline) ? row.timeline : [],
    deliverables: Array.isArray(row.deliverables) ? row.deliverables : [],
    addons: Array.isArray(row.addons) ? row.addons : [],
    expires_at: (row.expires_at as string | null) ?? null,
    sent_at: (row.sent_at as string | null) ?? null,
    first_viewed_at: (row.first_viewed_at as string | null) ?? null,
    last_viewed_at: (row.last_viewed_at as string | null) ?? null,
    accepted_at: (row.accepted_at as string | null) ?? null,
    declined_at: (row.declined_at as string | null) ?? null,
    client_feedback: (row.client_feedback as string | null) ?? null,
    document_id: row.document_id ? String(row.document_id) : null,
    work_project_id: row.work_project_id ? String(row.work_project_id) : null,
    portal_token_hash: row.portal_token_hash
      ? String(row.portal_token_hash)
      : null,
    portal_token_expires_at:
      (row.portal_token_expires_at as string | null) ?? null,
    external_metadata:
      row.external_metadata && typeof row.external_metadata === "object"
        ? (row.external_metadata as Record<string, unknown>)
        : {},
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function enrichProposals(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[]
): Promise<ProposalWithMeta[]> {
  const profileIds = [
    ...new Set(
      rows.flatMap((row) => [
        String(row.business_profile_id),
        String(row.client_profile_id),
      ])
    ),
  ];
  const profileNames = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data } = await supabase
      .from("guardian_profiles")
      .select("id, display_name")
      .in("id", profileIds);
    for (const row of data ?? []) {
      profileNames.set(String(row.id), String(row.display_name ?? "Vault"));
    }
  }

  const proposalIds = rows.map((row) => String(row.id));
  const viewCounts = new Map<string, number>();
  if (proposalIds.length > 0) {
    const { data: events } = await supabase
      .from("proposal_events")
      .select("proposal_id")
      .in("proposal_id", proposalIds)
      .eq("event_type", "viewed");
    for (const event of events ?? []) {
      const id = String(event.proposal_id);
      viewCounts.set(id, (viewCounts.get(id) ?? 0) + 1);
    }
  }

  return rows.map((row) => {
    const proposal = mapProposalRow(row);
    return {
      ...proposal,
      business_name:
        profileNames.get(proposal.business_profile_id) ?? null,
      client_name: profileNames.get(proposal.client_profile_id) ?? null,
      view_count: viewCounts.get(proposal.id) ?? 0,
    };
  });
}

export async function getProposalById(
  supabase: SupabaseClient,
  proposalId: string
): Promise<ProposalWithMeta | null> {
  const { data, error } = await supabase
    .from("proposals")
    .select(PROPOSAL_SELECT)
    .eq("id", proposalId)
    .maybeSingle();
  if (error || !data) return null;
  const [enriched] = await enrichProposals(supabase, [data]);
  return enriched ?? null;
}

export async function recordProposalEvent(
  supabase: SupabaseClient,
  args: {
    proposalId: string;
    eventType: ProposalEventType;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await supabase.from("proposal_events").insert({
    proposal_id: args.proposalId,
    event_type: args.eventType,
    actor_user_id: args.actorUserId ?? null,
    metadata: args.metadata ?? {},
  });
}

export async function loadProposalAnalytics(
  supabase: SupabaseClient,
  businessProfileId: string
): Promise<ProposalAnalytics> {
  const { data } = await supabase
    .from("proposals")
    .select("status, total_cents")
    .eq("business_profile_id", businessProfileId);

  const byStatus = Object.fromEntries(
    PROPOSAL_STATUSES.map((status) => [status, 0])
  ) as Record<ProposalStatus, number>;

  let totalValueCents = 0;
  let acceptedValueCents = 0;
  let sentCount = 0;
  let acceptedCount = 0;

  for (const row of data ?? []) {
    const status = String(row.status) as ProposalStatus;
    if (byStatus[status] != null) byStatus[status] += 1;
    const value = Number(row.total_cents ?? 0);
    totalValueCents += value;
    if (status !== "draft") sentCount += 1;
    if (status === "accepted") {
      acceptedCount += 1;
      acceptedValueCents += value;
    }
  }

  const total = data?.length ?? 0;
  const viewedCount =
    byStatus.viewed + byStatus.changes_requested + byStatus.accepted + byStatus.declined;

  return {
    total,
    byStatus,
    totalValueCents,
    acceptedValueCents,
    viewRate: sentCount > 0 ? viewedCount / sentCount : 0,
    acceptRate: sentCount > 0 ? acceptedCount / sentCount : 0,
  };
}

export async function clientVaultIdsForBusiness(
  supabase: SupabaseClient,
  businessProfileId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("guardian_profiles")
    .select("id")
    .eq("parent_profile_id", businessProfileId)
    .eq("profile_type", "client");
  return (data ?? []).map((row) => String(row.id));
}

export { mapProposalRow };
