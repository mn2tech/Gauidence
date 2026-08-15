import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BusinessCommitment, CommitmentStatus, GideonClaim } from "./types";
import { deriveCommitmentsFromProposal } from "./commitmentDerive";

export { deriveCommitmentsFromProposal };

const COMMITMENT_SELECT =
  "id, organization_id, client_entity_id, source_entity_id, description, commitment_type, status, due_date, owner_entity_id, confidence, evidence_id, created_at, updated_at";

function mapCommitment(row: Record<string, unknown>): BusinessCommitment {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    client_entity_id: row.client_entity_id
      ? String(row.client_entity_id)
      : null,
    source_entity_id: row.source_entity_id
      ? String(row.source_entity_id)
      : null,
    description: String(row.description ?? ""),
    commitment_type: row.commitment_type
      ? String(row.commitment_type)
      : null,
    status: (String(row.status ?? "UNKNOWN") as CommitmentStatus) || "UNKNOWN",
    due_date: row.due_date ? String(row.due_date) : null,
    owner_entity_id: row.owner_entity_id
      ? String(row.owner_entity_id)
      : null,
    confidence:
      row.confidence != null && Number.isFinite(Number(row.confidence))
        ? Number(row.confidence)
        : null,
    evidence_id: row.evidence_id ? String(row.evidence_id) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function listCommitmentsForOrganization(
  supabase: SupabaseClient,
  organizationId: string
): Promise<BusinessCommitment[]> {
  const { data, error } = await supabase
    .from("business_commitments")
    .select(COMMITMENT_SELECT)
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    // Table may not exist yet in local envs without migration — fail soft.
    console.warn(
      "business_commitments list failed:",
      error.message
    );
    return [];
  }
  return (data ?? []).map((row) => mapCommitment(row as Record<string, unknown>));
}

export async function listCommitmentsForClient(
  supabase: SupabaseClient,
  args: { organizationId: string; clientEntityId: string }
): Promise<BusinessCommitment[]> {
  const { data, error } = await supabase
    .from("business_commitments")
    .select(COMMITMENT_SELECT)
    .eq("organization_id", args.organizationId)
    .eq("client_entity_id", args.clientEntityId)
    .order("updated_at", { ascending: false })
    .limit(40);

  if (error) {
    console.warn("business_commitments client list failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => mapCommitment(row as Record<string, unknown>));
}

/**
 * Derive commitment candidates from accepted proposals / deliverables.
 * Distinguishes PROPOSED vs AGREED/COMMITTED — never promotes draft to committed.
 */
// deriveCommitmentsFromProposal lives in commitmentDerive.ts (pure).

export async function groupCommitmentsByClient(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    entityNames: Record<string, string>;
  }
): Promise<{
  groups: Array<{
    clientName: string;
    clientEntityId: string | null;
    commitments: Array<{
      description: string;
      status: CommitmentStatus;
      dueDate: string | null;
    }>;
  }>;
  claims: GideonClaim[];
}> {
  const rows = await listCommitmentsForOrganization(
    supabase,
    args.organizationId
  );

  const byClient = new Map<
    string,
    {
      clientName: string;
      clientEntityId: string | null;
      commitments: Array<{
        description: string;
        status: CommitmentStatus;
        dueDate: string | null;
      }>;
    }
  >();

  for (const row of rows) {
    const key = row.client_entity_id ?? "unknown";
    const clientName =
      (row.client_entity_id && args.entityNames[row.client_entity_id]) ||
      "Unassigned client";
    const group = byClient.get(key) ?? {
      clientName,
      clientEntityId: row.client_entity_id,
      commitments: [],
    };
    group.commitments.push({
      description: row.description,
      status: row.status,
      dueDate: row.due_date,
    });
    byClient.set(key, group);
  }

  const groups = [...byClient.values()];
  const claims: GideonClaim[] = [];
  for (const g of groups) {
    for (const c of g.commitments.slice(0, 5)) {
      claims.push({
        claim: `${g.clientName}: ${c.description} [${c.status}]`,
        kind: "KNOWN_FACT",
        confidence: 0.8,
        evidence: [
          {
            sourceId: g.clientEntityId ?? args.organizationId,
            sourceType: "commitment",
            label: c.description,
            reference: c.status,
          },
        ],
      });
    }
  }

  return { groups, claims };
}

/**
 * Upsert derived commitments for an accepted/sent proposal (idempotent by description hash).
 */
export async function syncProposalCommitments(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    clientEntityId: string | null;
    proposalId: string;
    title: string;
    status: string;
    deliverables: Array<{ title: string; description?: string }>;
  }
): Promise<number> {
  const derived = deriveCommitmentsFromProposal(args);
  let written = 0;
  for (const item of derived) {
    const { error } = await supabase.from("business_commitments").upsert(
      {
        organization_id: args.organizationId,
        client_entity_id: args.clientEntityId,
        source_entity_id: null,
        description: item.description,
        commitment_type: item.commitment_type,
        status: item.status,
        confidence: args.status === "accepted" ? 0.9 : 0.6,
        external_key: `proposal:${args.proposalId}:${normalizeKey(item.description)}`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,external_key" }
    );
    if (!error) written += 1;
  }
  return written;
}

function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
