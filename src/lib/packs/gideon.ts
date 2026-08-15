/**
 * Pack-aware Gideon helpers — Business Chief of Staff skill loading
 * and question classification (pure where possible for unit tests).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { GUARDIAN_BUSINESS_PACK_SLUG } from "./types";

/** Business knowledge / relationship questions that need ontology + search. */
const BUSINESS_KNOWLEDGE =
  /\b((what|which|our|my|the) clients?\b|clients? (are|do|we|we'?re)|working with|everything we know about|what proposals?\b|proposals? (are|have|outstanding)|what contracts?\b|contracts? (expire|expiring|outstanding)|what projects?\b|projects? (associated|for|with)|who (is|are) working on|what did we promise|business relationships?|show me everything we know)\b/i;

/** Advisory / prioritization questions (facts + recommendations). */
const BUSINESS_ADVISORY =
  /\b(what should i (follow up|focus|do|prioritize)|what needs (my )?attention|which proposals? have not|follow[- ]?up on)\b/i;

export function isBusinessKnowledgeQuestion(question: string): boolean {
  return BUSINESS_KNOWLEDGE.test(question.trim());
}

export function isBusinessAdvisoryQuestion(question: string): boolean {
  return BUSINESS_ADVISORY.test(question.trim());
}

type SkillCacheEntry = { prompt: string; expiresAt: number };
const skillPromptCache = new Map<string, SkillCacheEntry>();
const SKILL_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Lightweight skill prompt load for hot Gideon path.
 * Does NOT load the full pack definition (entity types, dashboard, etc.).
 */
export async function loadInstalledPackSkillPrompt(
  supabase: SupabaseClient,
  profileId: string,
  packSlug: string = GUARDIAN_BUSINESS_PACK_SLUG
): Promise<string> {
  const cacheKey = `${profileId}:${packSlug}`;
  const cached = skillPromptCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.prompt;
  }

  const { data: pack } = await supabase
    .from("packs")
    .select("id")
    .eq("slug", packSlug)
    .maybeSingle();
  if (!pack?.id) {
    skillPromptCache.set(cacheKey, { prompt: "", expiresAt: Date.now() + SKILL_CACHE_TTL_MS });
    return "";
  }

  const { data: installation } = await supabase
    .from("profile_packs")
    .select("pack_version_id")
    .eq("profile_id", profileId)
    .eq("pack_id", pack.id)
    .eq("status", "installed")
    .maybeSingle();
  if (!installation?.pack_version_id) {
    skillPromptCache.set(cacheKey, { prompt: "", expiresAt: Date.now() + SKILL_CACHE_TTL_MS });
    return "";
  }

  const { data: skills } = await supabase
    .from("pack_gideon_skills")
    .select("prompt_addon")
    .eq("pack_version_id", installation.pack_version_id)
    .order("sort_order");

  const prompt = (skills ?? [])
    .map((s) => String(s.prompt_addon ?? "").trim())
    .filter(Boolean)
    .join("\n\n");

  skillPromptCache.set(cacheKey, {
    prompt,
    expiresAt: Date.now() + SKILL_CACHE_TTL_MS,
  });
  return prompt;
}

/** @deprecated Prefer loadInstalledPackSkillPrompt on hot paths. */
export async function loadInstalledPackSkills(
  supabase: SupabaseClient,
  profileId: string,
  packSlug: string = GUARDIAN_BUSINESS_PACK_SLUG
): Promise<Array<{ prompt_addon: string }>> {
  const prompt = await loadInstalledPackSkillPrompt(supabase, profileId, packSlug);
  return prompt ? [{ prompt_addon: prompt }] : [];
}

export function formatPackSkillsForPrompt(
  skills: Array<{ prompt_addon: string }>
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
