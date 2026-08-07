import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_PROPOSAL_TEMPLATE_SEEDS,
} from "./defaultTemplates";
import { PROPOSAL_TEMPLATE_SELECT, type ProposalTemplate } from "./types";

export async function ensureDefaultProposalTemplates(
  supabase: SupabaseClient,
  args: { businessProfileId: string; userId: string }
): Promise<ProposalTemplate[]> {
  const { data: existing } = await supabase
    .from("proposal_templates")
    .select(PROPOSAL_TEMPLATE_SELECT)
    .eq("business_profile_id", args.businessProfileId)
    .eq("is_active", true);

  if ((existing ?? []).length > 0) {
    return (existing ?? []) as ProposalTemplate[];
  }

  const rows = DEFAULT_PROPOSAL_TEMPLATE_SEEDS.map((seed) => ({
    business_profile_id: args.businessProfileId,
    created_by: args.userId,
    name: seed.name,
    description: seed.description,
    default_title: seed.default_title,
    default_summary: seed.default_summary,
    default_introduction: seed.default_introduction,
    default_terms: seed.default_terms,
    default_line_items: seed.default_line_items.map((item) => ({
      ...item,
      id: randomUUID(),
    })),
    default_timeline: seed.default_timeline.map((item) => ({
      ...item,
      id: randomUUID(),
    })),
    default_deliverables: seed.default_deliverables.map((item) => ({
      ...item,
      id: randomUUID(),
    })),
    default_addons: seed.default_addons.map((item) => ({
      ...item,
      id: randomUUID(),
    })),
    is_active: true,
  }));

  const { data: inserted } = await supabase
    .from("proposal_templates")
    .insert(rows)
    .select(PROPOSAL_TEMPLATE_SELECT);

  return (inserted ?? []) as ProposalTemplate[];
}

export async function loadProposalTemplate(
  supabase: SupabaseClient,
  templateId: string
): Promise<ProposalTemplate | null> {
  const { data } = await supabase
    .from("proposal_templates")
    .select(PROPOSAL_TEMPLATE_SELECT)
    .eq("id", templateId)
    .maybeSingle();
  return (data as ProposalTemplate | null) ?? null;
}

export async function findDefaultAssessmentTemplate(
  supabase: SupabaseClient,
  businessProfileId: string
): Promise<ProposalTemplate | null> {
  const { data } = await supabase
    .from("proposal_templates")
    .select(PROPOSAL_TEMPLATE_SELECT)
    .eq("business_profile_id", businessProfileId)
    .eq("is_active", true)
    .ilike("name", "%assessment%")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (data) return data as ProposalTemplate;

  const { data: first } = await supabase
    .from("proposal_templates")
    .select(PROPOSAL_TEMPLATE_SELECT)
    .eq("business_profile_id", businessProfileId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (first as ProposalTemplate | null) ?? null;
}
