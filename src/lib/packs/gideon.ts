/**
 * Pack-aware Gideon helpers — Business Chief of Staff skill text
 * and question classification (pure; safe for unit tests / hot paths).
 *
 * Hot path rule: never hit the database from Ask Gideon context assembly.
 * Skill prompt is a static constant (same text seeded in pack_gideon_skills).
 */

import { GUARDIAN_BUSINESS_PACK_SLUG } from "./types";

export { GUARDIAN_BUSINESS_PACK_SLUG };

/** Same wording as guardian-business pack_gideon_skills.prompt_addon (v1.0.0). */
export const BUSINESS_CHIEF_OF_STAFF_PROMPT = `BUSINESS CHIEF OF STAFF (Guardian Business Pack):
You help the user understand and operate their business using Guardian data.
Distinguish clearly between:
1) Known from Guardian data (ontology entities, relationships, evidence, documents, proposals, connected sources)
2) Gideon's recommendation (advisory judgment based on available context)

Never fabricate organizational facts. If evidence is thin, say what is known and what is missing.
Prefer citing evidence (document names, proposal titles, source items) when stating facts.
For relationship questions, use ontology relationships and linked Spaces.
For analytical questions (outstanding proposals, contracts expiring, tasks needing attention), reason over available structured data and recent activity — do not invent deadlines or clients.
For advisory questions ("what should I follow up on?"), give practical next steps labeled as recommendations.`;

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
