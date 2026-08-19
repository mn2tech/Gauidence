import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { denormalizeSnapshot } from "@/lib/leads/research/facts";
import type {
  LeadGraphEntityType,
  LeadGraphRelationshipType,
  LeadResearchSnapshot,
  ResearchMode,
} from "@/lib/leads/research/types";
import { recordLeadActivity } from "@/lib/leads/server";

type EntityRef = { id: string; type: LeadGraphEntityType; name: string };

async function upsertEntity(
  supabase: SupabaseClient,
  args: {
    businessProfileId: string;
    leadId: string;
    runId: string;
    type: LeadGraphEntityType;
    name: string;
    canonical?: string;
    properties?: Record<string, unknown>;
    parentId?: string | null;
  }
): Promise<EntityRef | null> {
  const canonical = (args.canonical || args.name).trim();
  if (!canonical) return null;
  const { data: existing } = await supabase
    .from("lead_graph_entities")
    .select("id")
    .eq("lead_id", args.leadId)
    .eq("entity_type", args.type)
    .ilike("canonical_name", canonical)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("lead_graph_entities")
      .update({
        name: args.name,
        properties: args.properties ?? {},
        parent_id: args.parentId ?? null,
        last_research_run_id: args.runId,
      })
      .eq("id", existing.id);
    return { id: String(existing.id), type: args.type, name: args.name };
  }

  const { data, error } = await supabase
    .from("lead_graph_entities")
    .insert({
      business_profile_id: args.businessProfileId,
      lead_id: args.leadId,
      entity_type: args.type,
      name: args.name,
      canonical_name: canonical,
      properties: args.properties ?? {},
      parent_id: args.parentId ?? null,
      last_research_run_id: args.runId,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return { id: String(data.id), type: args.type, name: args.name };
}

async function upsertRelationship(
  supabase: SupabaseClient,
  args: {
    businessProfileId: string;
    leadId: string;
    runId: string;
    sourceId: string;
    type: LeadGraphRelationshipType;
    targetId: string;
    properties?: Record<string, unknown>;
  }
): Promise<void> {
  const { data: existing } = await supabase
    .from("lead_graph_relationships")
    .select("id")
    .eq("lead_id", args.leadId)
    .eq("source_entity_id", args.sourceId)
    .eq("relationship_type", args.type)
    .eq("target_entity_id", args.targetId)
    .maybeSingle();
  if (existing?.id) {
    await supabase
      .from("lead_graph_relationships")
      .update({
        properties: args.properties ?? {},
        research_run_id: args.runId,
      })
      .eq("id", existing.id);
    return;
  }
  await supabase.from("lead_graph_relationships").insert({
    business_profile_id: args.businessProfileId,
    lead_id: args.leadId,
    source_entity_id: args.sourceId,
    relationship_type: args.type,
    target_entity_id: args.targetId,
    properties: args.properties ?? {},
    research_run_id: args.runId,
  });
}

export async function persistLeadResearch(
  supabase: SupabaseClient,
  args: {
    leadId: string;
    businessProfileId: string;
    userId: string;
    snapshot: LeadResearchSnapshot;
    applyDenormalized: boolean;
    overwriteRelationshipOwner: boolean;
  }
): Promise<void> {
  const mode: ResearchMode = args.snapshot.mode === "refresh" ? "refresh" : "full";
  const { data: run, error: runError } = await supabase
    .from("lead_research_runs")
    .insert({
      business_profile_id: args.businessProfileId,
      lead_id: args.leadId,
      mode,
      query_company_name: args.snapshot.query.companyName,
      query_website: args.snapshot.query.website || null,
      status: "complete",
      summary: args.snapshot.summary,
      partner_fit: args.snapshot.partnerFit,
      snapshot: args.snapshot,
      created_by: args.userId,
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error("Couldn't save research history.");
  }

  const runId = String(run.id);
  const factRows = Object.entries(args.snapshot.facts).map(([field_key, fact]) => ({
    research_run_id: runId,
    lead_id: args.leadId,
    field_key,
    value_json: fact.value ?? null,
    confidence: fact.confidence,
    source: fact.source || null,
    source_type: fact.sourceType,
    source_url: fact.sourceUrl ?? null,
    verified_at: fact.verifiedAt ?? null,
  }));
  if (factRows.length > 0) {
    await supabase.from("lead_research_facts").insert(factRows);
  }

  if (args.applyDenormalized) {
    const denorm = denormalizeSnapshot(args.snapshot);
    const updates: Record<string, unknown> = {
      ...denorm,
      last_researched_at: args.snapshot.researchedAt,
      partner_fit: args.snapshot.partnerFit,
      research_summary: args.snapshot.summary,
      federal_profile_data: {
        naics: args.snapshot.naics,
        agencies: args.snapshot.agencies,
        vehicles: args.snapshot.vehicles,
        contracts: args.snapshot.contracts,
        opportunities: args.snapshot.opportunities,
        opportunitiesVerified: args.snapshot.opportunitiesVerified,
        capabilityTags: args.snapshot.capabilityTags,
        pastPerformanceTags: args.snapshot.pastPerformanceTags,
        technologyTags: args.snapshot.technologyTags,
        smallBusinessStatuses: args.snapshot.smallBusinessStatuses,
        facts: args.snapshot.facts,
        suggestedRelationshipOwner: args.snapshot.suggestedRelationshipOwner,
        checklist: args.snapshot.checklist,
      },
    };
    if (!args.overwriteRelationshipOwner) {
      delete updates.relationship_owner;
    }
    await supabase.from("business_leads").update(updates).eq("id", args.leadId);
  }

  const company = await upsertEntity(supabase, {
    businessProfileId: args.businessProfileId,
    leadId: args.leadId,
    runId,
    type: "company",
    name: args.snapshot.legalCompanyName || args.snapshot.companyName,
    canonical: args.snapshot.legalCompanyName || args.snapshot.companyName,
    properties: {
      uei: args.snapshot.uei,
      cageCode: args.snapshot.cageCode,
      website: args.snapshot.website,
    },
  });

  if (company) {
    for (const agency of args.snapshot.agencies) {
      const agencyNode = await upsertEntity(supabase, {
        businessProfileId: args.businessProfileId,
        leadId: args.leadId,
        runId,
        type: "agency",
        name: agency.name,
        canonical: agency.name,
      });
      if (agencyNode) {
        await upsertRelationship(supabase, {
          businessProfileId: args.businessProfileId,
          leadId: args.leadId,
          runId,
          sourceId: company.id,
          type: "SERVES",
          targetId: agencyNode.id,
        });
        for (const bureau of agency.bureaus) {
          const bureauNode = await upsertEntity(supabase, {
            businessProfileId: args.businessProfileId,
            leadId: args.leadId,
            runId,
            type: "bureau",
            name: bureau,
            canonical: bureau,
            parentId: agencyNode.id,
          });
          if (bureauNode) {
            await upsertRelationship(supabase, {
              businessProfileId: args.businessProfileId,
              leadId: args.leadId,
              runId,
              sourceId: company.id,
              type: "SERVES",
              targetId: bureauNode.id,
            });
          }
        }
      }
    }

    for (const naics of args.snapshot.naics) {
      const node = await upsertEntity(supabase, {
        businessProfileId: args.businessProfileId,
        leadId: args.leadId,
        runId,
        type: "naics",
        name: `${naics.code}${naics.title ? ` — ${naics.title}` : ""}`,
        canonical: naics.code,
        properties: { isPrimary: naics.isPrimary, title: naics.title },
      });
      if (node) {
        await upsertRelationship(supabase, {
          businessProfileId: args.businessProfileId,
          leadId: args.leadId,
          runId,
          sourceId: company.id,
          type: "REGISTERED_UNDER",
          targetId: node.id,
        });
      }
    }

    for (const cap of args.snapshot.capabilityTags) {
      const node = await upsertEntity(supabase, {
        businessProfileId: args.businessProfileId,
        leadId: args.leadId,
        runId,
        type: "capability",
        name: cap,
        canonical: cap,
      });
      if (node) {
        await upsertRelationship(supabase, {
          businessProfileId: args.businessProfileId,
          leadId: args.leadId,
          runId,
          sourceId: company.id,
          type: "HAS_CAPABILITY",
          targetId: node.id,
        });
      }
    }

    for (const tech of args.snapshot.technologyTags) {
      const node = await upsertEntity(supabase, {
        businessProfileId: args.businessProfileId,
        leadId: args.leadId,
        runId,
        type: "technology",
        name: tech,
        canonical: tech,
      });
      if (node) {
        await upsertRelationship(supabase, {
          businessProfileId: args.businessProfileId,
          leadId: args.leadId,
          runId,
          sourceId: company.id,
          type: "USES",
          targetId: node.id,
        });
      }
    }

    for (const vehicle of args.snapshot.vehicles) {
      const node = await upsertEntity(supabase, {
        businessProfileId: args.businessProfileId,
        leadId: args.leadId,
        runId,
        type: "contract_vehicle",
        name: vehicle.name,
        canonical: vehicle.contractNumber || vehicle.name,
        properties: vehicle as unknown as Record<string, unknown>,
      });
      if (node) {
        await upsertRelationship(supabase, {
          businessProfileId: args.businessProfileId,
          leadId: args.leadId,
          runId,
          sourceId: company.id,
          type: "HOLDS",
          targetId: node.id,
        });
      }
    }

    for (const contract of args.snapshot.contracts) {
      const type: LeadGraphEntityType =
        contract.contractType === "task_order" ? "task_order" : "contract";
      const node = await upsertEntity(supabase, {
        businessProfileId: args.businessProfileId,
        leadId: args.leadId,
        runId,
        type,
        name: contract.name || contract.contractNumber,
        canonical: contract.contractNumber || contract.name,
        properties: contract as unknown as Record<string, unknown>,
      });
      if (node) {
        await upsertRelationship(supabase, {
          businessProfileId: args.businessProfileId,
          leadId: args.leadId,
          runId,
          sourceId: company.id,
          type: "WON",
          targetId: node.id,
        });
      }
    }

    for (const opp of args.snapshot.opportunities) {
      const node = await upsertEntity(supabase, {
        businessProfileId: args.businessProfileId,
        leadId: args.leadId,
        runId,
        type: "opportunity",
        name: opp.title,
        canonical: opp.noticeNumber || opp.title,
        properties: opp as unknown as Record<string, unknown>,
      });
      if (node) {
        await upsertRelationship(supabase, {
          businessProfileId: args.businessProfileId,
          leadId: args.leadId,
          runId,
          sourceId: node.id,
          type: "MATCHES",
          targetId: company.id,
        });
      }
    }
  }

  try {
    await recordLeadActivity(supabase, {
      leadId: args.leadId,
      activityType: mode === "refresh" ? "research_refreshed" : "researched",
      description:
        mode === "refresh"
          ? `Federal research refreshed · ${args.snapshot.summary.populated} fields`
          : `Company profile researched · ${args.snapshot.summary.populated} fields populated, ${args.snapshot.summary.verified} verified`,
      actorUserId: args.userId,
      metadata: {
        summary: args.snapshot.summary,
        partnerFit: args.snapshot.partnerFit.score,
        mode,
      },
    });
  } catch {
    // Non-critical.
  }
}

export async function loadLeadResearchRuns(
  supabase: SupabaseClient,
  leadId: string
): Promise<Array<{
  id: string;
  mode: string;
  summary: unknown;
  partner_fit: unknown;
  created_at: string;
}>> {
  const { data, error } = await supabase
    .from("lead_research_runs")
    .select("id, mode, summary, partner_fit, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}
