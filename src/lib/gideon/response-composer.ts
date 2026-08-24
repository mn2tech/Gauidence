/**
 * Gideon response composer — enforce depth, knowledge boundaries, and brevity.
 * Pure helpers safe for unit tests.
 */

import { unknownGuardianWorldAnswer } from "./knowledge-resolver";
import type { GideonOrchestrationRoute } from "./request-router";
import { orchestrationDepthToLegacy } from "./request-router";
import type {
  GuardianKnowledgeResult,
  KnowledgeSource,
  OrchestrationResponseDepth,
} from "./orchestration-types";

export type ComposeGideonResponseInput = {
  question: string;
  route: GideonOrchestrationRoute;
  knowledge: GuardianKnowledgeResult;
  /** Optional prose already produced from structured personal/business answers. */
  deterministicAnswer?: string | null;
  /** Optional tool/action result summary. */
  actionResult?: string | null;
  /** Suggested follow-ups (max 3); composer may attach when appropriate. */
  suggestedQuestions?: string[];
};

export type ComposedGideonResponse = {
  /** Final user-facing text when composer can answer without the LLM. */
  text: string | null;
  /** Notes injected into the system prompt for LLM generation. */
  systemNotes: string;
  responseDepth: OrchestrationResponseDepth;
  knowledgeSource: KnowledgeSource;
  generalKnowledgeAllowed: boolean;
  legacyDepth: 1 | 2 | 3 | 4;
  includeSuggestions: boolean;
  suggestedQuestions: string[];
};

const SHORT_WORD_BUDGET = 150;

export function responseDepthSystemNote(
  depth: OrchestrationResponseDepth
): string {
  switch (depth) {
    case "short":
      return `RESPONSE DEPTH = short (default): Answer in 1–4 short paragraphs, usually under ~150 words. Answer only what was asked. Include important source/evidence when appropriate. Optionally offer ONE useful next step. Do not add lectures, background essays, or unrelated recommendations.`;
    case "explain":
      return `RESPONSE DEPTH = explain: Provide a moderate explanation. Separate Guardian facts from general information. Stay focused — not an essay.`;
    case "deep":
      return `RESPONSE DEPTH = deep: The user asked for analysis, comparison, research, or everything known. Organized long-form is permitted. Still do not invent Guardian-world facts.`;
  }
}

export function knowledgeBoundarySystemNote(
  route: GideonOrchestrationRoute,
  knowledge: GuardianKnowledgeResult
): string {
  const lines: string[] = [
    "KNOWLEDGE PRIORITY (strict):",
    "1) Guardian knowledge (user's world)",
    "2) Current user / Space context",
    "3) General model knowledge — only when allowed and useful",
    "",
  ];

  switch (route.intent) {
    case "guardian_knowledge":
      lines.push(
        "MODE = guardian_knowledge: Answer ONLY from Guardian evidence below.",
        "Do NOT fill missing Space/business/personal facts with industry norms or guesses.",
        "If evidence is insufficient, say Guardian does not have it yet."
      );
      break;
    case "guardian_plus_general":
      lines.push(
        "MODE = guardian_plus_general: Establish Guardian facts first, then briefly use general knowledge for context.",
        "Clearly distinguish what Guardian knows vs general information (e.g. ## GENERAL KNOWLEDGE)."
      );
      break;
    case "general_knowledge":
      lines.push(
        "MODE = general_knowledge: Answer from general knowledge. Do not invent that it came from the user's Spaces."
      );
      break;
    case "action":
      lines.push(
        "MODE = action: Focus on the requested action. Keep confirmation clear and brief."
      );
      break;
    case "conversation":
      lines.push(
        "MODE = conversation: Be a concise thinking partner. Use Guardian context only when provided."
      );
      break;
    case "clarification":
      lines.push("MODE = clarification: Ask one clear clarifying question.");
      break;
  }

  lines.push("", `Knowledge status: ${knowledge.status}.`);
  if (
    knowledge.status === "unknown" &&
    route.guardianKnowledgeRequired
  ) {
    lines.push(
      "Guardian has no sufficient evidence for this user-world question. Do not invent carriers, amounts, dates, or relationships."
    );
  }
  if (knowledge.spaceName) {
    lines.push(`Prefer the current Space: ${knowledge.spaceName}.`);
  }
  return lines.join("\n");
}

function formatDirectFacts(knowledge: GuardianKnowledgeResult): string {
  if (!knowledge.directFacts.length) return "";
  return knowledge.directFacts
    .slice(0, 5)
    .map((f) => {
      const src = f.sourceLabel ? ` (${f.sourceLabel})` : "";
      return `- ${f.subject}: ${f.predicate} = ${f.value}${src}`;
    })
    .join("\n");
}

function formatEvidence(knowledge: GuardianKnowledgeResult): string {
  if (!knowledge.retrievalEvidence.length) return "";
  return knowledge.retrievalEvidence
    .map((e, i) => {
      const name = e.fileName ? ` [${e.fileName}]` : "";
      return `(${i + 1})${name} ${e.text.slice(0, 500)}`;
    })
    .join("\n\n");
}

/**
 * Build prompt notes + optional deterministic reply.
 * Pass only the strongest evidence — not a full RAG dump.
 */
export function composeGideonResponse(
  input: ComposeGideonResponseInput
): ComposedGideonResponse {
  const { question, route, knowledge } = input;
  const depth = route.responseDepth;
  const legacyDepth = orchestrationDepthToLegacy(depth);

  const notes = [
    responseDepthSystemNote(depth),
    knowledgeBoundarySystemNote(route, knowledge),
  ];

  const facts = formatDirectFacts(knowledge);
  if (facts) {
    notes.push(`\n--- GUARDIAN DIRECT FACTS ---\n${facts}\n--- END ---`);
  }
  const evidence = formatEvidence(knowledge);
  if (evidence) {
    notes.push(
      `\n--- RANKED EVIDENCE (budgeted) ---\n${evidence}\n--- END ---`
    );
  }

  let text: string | null = null;

  if (input.deterministicAnswer?.trim()) {
    text = input.deterministicAnswer.trim();
  } else if (input.actionResult?.trim() && route.intent === "action") {
    text = input.actionResult.trim();
  } else if (
    route.guardianKnowledgeRequired &&
    knowledge.status === "unknown" &&
    knowledge.directFacts.length === 0 &&
    knowledge.retrievalEvidence.length === 0
  ) {
    const subjectMatch =
      question.match(
        /\b(?:what|which)\s+(?:insurance|services?|fees?|minimum)\s+(?:does|do)\s+([^?]+?)\s+(?:accept|offer|charge|require)/i
      ) ??
      question.match(/\b(?:about|for|from)\s+([A-Z][\w &.'-]{1,40})/i);
    const subject = subjectMatch?.[1]?.replace(/\s+accept.*$/i, "").trim();
    const insurance = /\binsurance\b/i.test(question);
    text = unknownGuardianWorldAnswer({
      subject: subject || knowledge.spaceName,
      topic: insurance ? "accepted insurance plans" : "that information",
      spaceName: knowledge.spaceName,
      suggestUpload: true,
    });
  } else if (
    knowledge.directFacts.length === 1 &&
    depth === "short" &&
    route.intent === "guardian_knowledge"
  ) {
    const f = knowledge.directFacts[0]!;
    text = `${f.subject}'s ${f.predicate} is ${f.value}.`;
  }

  const includeSuggestions =
    Boolean(input.suggestedQuestions?.length) &&
    route.intent !== "clarification" &&
    route.intent !== "action" &&
    (knowledge.status === "known" ||
      knowledge.status === "partially_known") &&
    depth !== "deep";

  return {
    text,
    systemNotes: notes.join("\n"),
    responseDepth: depth,
    knowledgeSource: route.knowledgeSource,
    generalKnowledgeAllowed: route.generalKnowledgeAllowed,
    legacyDepth,
    includeSuggestions,
    suggestedQuestions: includeSuggestions
      ? (input.suggestedQuestions ?? []).slice(0, 3)
      : [],
  };
}

/** Soft trim for short-mode deterministic answers. */
export function enforceShortAnswer(
  text: string,
  depth: OrchestrationResponseDepth
): string {
  if (depth !== "short") return text;
  const words = text.trim().split(/\s+/);
  if (words.length <= SHORT_WORD_BUDGET) return text.trim();
  const sentences = text.trim().split(/(?<=[.!?])\s+/);
  let out = "";
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s;
    if (next.split(/\s+/).length > SHORT_WORD_BUDGET) break;
    out = next;
  }
  return out || words.slice(0, SHORT_WORD_BUDGET).join(" ");
}
