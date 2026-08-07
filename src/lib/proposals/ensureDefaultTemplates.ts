import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_HOMEPAGE_SPRINT_TEMPLATE_NAME,
  DEFAULT_PROPOSAL_TEMPLATE_SEEDS,
  type ProposalTemplateSeed,
} from "./defaultTemplates";
import { PROPOSAL_TEMPLATE_SELECT, type ProposalTemplate } from "./types";

function seedToRow(
  seed: ProposalTemplateSeed,
  args: { businessProfileId: string; userId: string }
) {
  return {
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
  };
}

export async function ensureDefaultProposalTemplates(
  supabase: SupabaseClient,
  args: { businessProfileId: string; userId: string }
): Promise<ProposalTemplate[]> {
  const { data: existing } = await supabase
    .from("proposal_templates")
    .select(PROPOSAL_TEMPLATE_SELECT)
    .eq("business_profile_id", args.businessProfileId)
    .eq("is_active", true);

  const current = (existing ?? []) as ProposalTemplate[];
  const existingNames = new Set(current.map((t) => t.name.trim().toLowerCase()));
  const missingSeeds = DEFAULT_PROPOSAL_TEMPLATE_SEEDS.filter(
    (seed) => !existingNames.has(seed.name.trim().toLowerCase())
  );

  if (missingSeeds.length > 0) {
    const rows = missingSeeds.map((seed) => seedToRow(seed, args));
    const { data: inserted } = await supabase
      .from("proposal_templates")
      .insert(rows)
      .select(PROPOSAL_TEMPLATE_SELECT);

    current.push(...((inserted ?? []) as ProposalTemplate[]));
  }

  await syncDefaultTemplateSeeds(supabase, args.businessProfileId);

  return current;
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

export async function findHomepageSprintTemplate(
  supabase: SupabaseClient,
  businessProfileId: string
): Promise<ProposalTemplate | null> {
  const { data } = await supabase
    .from("proposal_templates")
    .select(PROPOSAL_TEMPLATE_SELECT)
    .eq("business_profile_id", businessProfileId)
    .eq("is_active", true)
    .eq("name", DEFAULT_HOMEPAGE_SPRINT_TEMPLATE_NAME)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as ProposalTemplate | null) ?? null;
}

function seedContentEquals(
  template: ProposalTemplate,
  seed: ProposalTemplateSeed
): boolean {
  return (
    template.default_title === seed.default_title &&
    template.default_summary === seed.default_summary &&
    template.default_introduction === seed.default_introduction &&
    template.default_terms === seed.default_terms
  );
}

/** Refresh stored default templates when seed copy changes (e.g. homepage sprint). */
export async function syncDefaultTemplateSeeds(
  supabase: SupabaseClient,
  businessProfileId: string
): Promise<void> {
  const { data: existing } = await supabase
    .from("proposal_templates")
    .select(PROPOSAL_TEMPLATE_SELECT)
    .eq("business_profile_id", businessProfileId)
    .eq("is_active", true);

  for (const template of (existing ?? []) as ProposalTemplate[]) {
    const seed = DEFAULT_PROPOSAL_TEMPLATE_SEEDS.find(
      (s) => s.name.trim().toLowerCase() === template.name.trim().toLowerCase()
    );
    if (!seed || seedContentEquals(template, seed)) continue;

    await supabase
      .from("proposal_templates")
      .update({
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
      })
      .eq("id", template.id);
  }
}
