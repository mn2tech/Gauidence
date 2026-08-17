/**
 * Pack-aware Gideon helpers — Business / Dental skill text
 * and question classification (pure; safe for unit tests / hot paths).
 *
 * Hot path rule: never hit the database from Ask Gideon context assembly.
 * Skill prompt is a static constant (same text seeded in pack_gideon_skills).
 */

import {
  GUARDIAN_BUSINESS_PACK_SLUG,
  GUARDIAN_DENTAL_PACK_SLUG,
} from "./types";

export { GUARDIAN_BUSINESS_PACK_SLUG, GUARDIAN_DENTAL_PACK_SLUG };

/** Same wording as guardian-business pack_gideon_skills (v1.1.0 BI + CoS). */
export const BUSINESS_CHIEF_OF_STAFF_PROMPT = `BUSINESS CHIEF OF STAFF (Guardian Business Pack V1.1):
You help the user understand and operate their business using Guardian data.
When BUSINESS INTELLIGENCE context is present, prefer it over raw excerpt dumps.

Distinguish clearly between:
1) Known from Guardian data (ontology entities, relationships, evidence, documents, proposals, commitments, connected sources)
2) Gideon's recommendation (advisory judgment based on available context)

Never fabricate organizational facts. If evidence is thin, say what is known and what is missing.
Prefer citing evidence (document names, proposal titles, source items) when stating facts.
For Entity 360 / "everything we know" questions: give a concise business summary (identity, relationships, contacts, proposals, projects, commitments, risks, sources) — not hundreds of extracted facts.
For relationship questions, use ontology relationships and linked Spaces first.
For proposal follow-up questions, use ranked candidates and include WHY.
For commitment questions, preserve PROPOSED vs RECOMMENDED vs AGREED/COMMITTED.
For "where did you get that?", use PRIOR CLAIMS / sources — do not invent a new search.
Never present system/process metadata (queued documents, extraction jobs, configure settings) as client business facts.
For advisory questions ("what should I focus on next?"), rank practical priorities with Why, Evidence, Confidence, and Recommended next step.`;

/** Same wording as guardian-dental pack_gideon_skills (v1.0.0). */
export const DENTAL_PRACTICE_OPS_PROMPT = `DENTAL PRACTICE OPS (Guardian Dental Pack):
You help the user run a dental practice using Guardian data.
Distinguish clearly between:
1) Known from Guardian data (ontology entities, relationships, evidence, documents, connected sources)
2) Gideon's recommendation (advisory judgment based on available context)

Never fabricate patient, clinical, insurance, or appointment facts. If evidence is thin, say what is known and what is missing.
Prefer citing evidence (document names, source items) when stating facts.
For "everything we know about [patient]" questions: give a concise practice summary (identity, providers, appointments, treatment plans, claims, tasks, sources) — not a raw extraction dump.
For scheduling and claim follow-up questions, reason over available structured data — do not invent appointment times, claim statuses, or payer decisions.
Never give definitive medical, clinical, or insurance advice. Stay operational (who, what, when, status, next admin step).
For advisory questions ("what should I follow up on?"), give practical next steps labeled as recommendations.
Protect privacy: do not invent PHI; only use facts present in Guardian context for this Space.`;

/** Business knowledge / relationship questions that need ontology + search. */
const BUSINESS_KNOWLEDGE =
  /\b((what|which|our|my|the) clients?\b|clients? (are|do|we|we'?re)|working with|everything we know about|what proposals?\b|proposals? (are|have|outstanding|need)|what contracts?\b|contracts? (expire|expiring|outstanding)|what projects?\b|projects? (associated|for|with)|who (is|are) working on|what did we promise|what commitments?\b|commitments? (have|did|to)|business relationships?|what relationships?\b|relationships? (do we|with)|show me everything we know|where did you get)\b/i;

/** Advisory / prioritization questions (facts + recommendations). */
const BUSINESS_ADVISORY =
  /\b(what should i (follow up|focus|do|prioritize)|what needs (my )?attention|which proposals? have not|follow[- ]?up on|focus on next)\b/i;

/** Dental practice knowledge questions. */
const DENTAL_KNOWLEDGE =
  /\b((what|which|our|my|the) patients?\b|patients? (have|with|need|are)|upcoming appointments?|insurance claims?|claims? (need|pending|denied|follow)|treatment plans?|lab cases?|who is treating|dental (practice|clinic|office)|hygienist|dentist|payer|referrals?)\b/i;

/** Dental advisory / prioritization. */
const DENTAL_ADVISORY =
  /\b(what should i follow up on( today)?|what needs (my )?attention (in )?(the )?practice|practice follow[- ]?ups?)\b/i;

export function isBusinessKnowledgeQuestion(question: string): boolean {
  return BUSINESS_KNOWLEDGE.test(question.trim());
}

export function isBusinessAdvisoryQuestion(question: string): boolean {
  return BUSINESS_ADVISORY.test(question.trim());
}

export function isDentalKnowledgeQuestion(question: string): boolean {
  return DENTAL_KNOWLEDGE.test(question.trim());
}

export function isDentalAdvisoryQuestion(question: string): boolean {
  return DENTAL_ADVISORY.test(question.trim());
}

/** Zero-DB pack skill note for Gideon system prompt. */
export function businessPackSkillPromptNote(options: {
  packEngineEnabled: boolean;
  isOrgSpace: boolean;
  includeSkill: boolean;
}): string {
  if (
    !options.packEngineEnabled ||
    !options.isOrgSpace ||
    !options.includeSkill
  ) {
    return "";
  }
  return BUSINESS_CHIEF_OF_STAFF_PROMPT;
}

export function dentalPackSkillPromptNote(options: {
  packEngineEnabled: boolean;
  isOrgSpace: boolean;
  includeSkill: boolean;
}): string {
  if (
    !options.packEngineEnabled ||
    !options.isOrgSpace ||
    !options.includeSkill
  ) {
    return "";
  }
  return DENTAL_PRACTICE_OPS_PROMPT;
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
      id: "biz_entity",
      label: "Entity summary",
      prompt: "Show me everything we know about Proxdose.",
    },
    {
      id: "biz_proposals_gap",
      label: "Proposals vs projects",
      prompt: "Which clients have proposals but no active project?",
    },
    {
      id: "biz_followup",
      label: "Proposal follow-up",
      prompt: "What proposals need follow-up?",
    },
    {
      id: "biz_focus",
      label: "Focus next",
      prompt: "What should I focus on next?",
    },
  ];
}

export function buildDentalQuickActions(): Array<{
  id: string;
  label: string;
  prompt: string;
}> {
  return [
    {
      id: "dental_patients",
      label: "Upcoming appointments",
      prompt: "Which patients have upcoming appointments?",
    },
    {
      id: "dental_claims",
      label: "Claims follow-up",
      prompt: "What insurance claims need follow-up?",
    },
    {
      id: "dental_plans",
      label: "Treatment plans",
      prompt: "Which treatment plans are incomplete?",
    },
    {
      id: "dental_focus",
      label: "Focus today",
      prompt: "What should I follow up on today?",
    },
  ];
}
