/**
 * Pack-aware Gideon helpers — Business Chief of Staff skill loading
 * and question classification (pure where possible for unit tests).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getInstalledPack } from "./catalog";
import {
  GUARDIAN_BUSINESS_PACK_SLUG,
  type PackGideonSkillRow,
} from "./types";

/** Business knowledge / relationship questions that need ontology + search. */
const BUSINESS_KNOWLEDGE =
  /\b(clients?|contractors?|employees?|proposals?|contracts?|projects?|opportunit(?:y|ies)|policies|procedures?|tasks?|follow[- ]?up|outstanding|expire|expiring|working with|everything we know about|who (is|are|works)|what (clients?|proposals?|contracts?|projects?|tasks?)|show me (everything|all)|what did we promise|associated with|business relationships?)\b/i;

/** Advisory / prioritization questions (facts + recommendations). */
const BUSINESS_ADVISORY =
  /\b(what should i (follow up|focus|do|prioritize)|what needs (my )?attention|what(?:'s| is) (outstanding|overdue)|recommend|next steps?|follow[- ]?up on)\b/i;

export function isBusinessKnowledgeQuestion(question: string): boolean {
  return BUSINESS_KNOWLEDGE.test(question.trim());
}

export function isBusinessAdvisoryQuestion(question: string): boolean {
  return BUSINESS_ADVISORY.test(question.trim());
}

export async function loadInstalledPackSkills(
  supabase: SupabaseClient,
  profileId: string,
  packSlug: string = GUARDIAN_BUSINESS_PACK_SLUG
): Promise<PackGideonSkillRow[]> {
  const installed = await getInstalledPack(supabase, profileId, packSlug);
  if (!installed) return [];
  return installed.definition.gideonSkills;
}

export function formatPackSkillsForPrompt(
  skills: PackGideonSkillRow[]
): string {
  if (!skills.length) return "";
  return skills
    .map((s) => s.prompt_addon.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function buildBusinessQuickActions(): Array<{
  id: string;
  label: string;
  prompt: string;
}> {
  return [
    {
      id: "biz_clients",
      label: "Our clients",
      prompt: "What clients are we currently working with?",
    },
    {
      id: "biz_proposals",
      label: "Open proposals",
      prompt: "What proposals are outstanding?",
    },
    {
      id: "biz_followup",
      label: "Follow up",
      prompt: "What should I follow up on?",
    },
    {
      id: "biz_contracts",
      label: "Contracts",
      prompt: "What contracts expire in the next 90 days?",
    },
  ];
}
