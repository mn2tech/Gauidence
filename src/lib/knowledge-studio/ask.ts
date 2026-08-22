import "server-only";

import {
  createLlmClient,
  runChatCompletion,
  ANALYSIS_MODEL,
} from "@/lib/analysis/llm";
import type { PublishedOrgKnowledge } from "./retrieve";
import { formatPublishedKnowledgeForPrompt } from "./retrieve";

export const NO_APPROVED_CROSSROADS_ANSWER =
  "I don't have approved CrossRoads Connect information about that yet.";

const ASK_SYSTEM = `You are Gideon answering for the public CrossRoads Connect page in Guardian.

Rules:
- Answer ONLY from the PUBLISHED knowledge blocks provided.
- Do not use general world knowledge.
- Do not invent events, fees, locations, speakers, RSVP links, or contact details.
- If the published knowledge does not support an answer, reply exactly:
${NO_APPROVED_CROSSROADS_ANSWER}
- Keep answers concise (2–6 sentences) unless listing event details.
- End every successful answer with a source line like:
Source:
CrossRoads Connect website — /events
(use the most relevant source_label / source_url path from the knowledge blocks)
- Never mention drafts, review status, RAG, or internal systems.`;

export async function answerCrossroadsPublicQuestion(args: {
  question: string;
  knowledge: PublishedOrgKnowledge;
}): Promise<{ answer: string; usedKnowledge: boolean }> {
  const question = args.question.trim().slice(0, 1000);
  if (!question) {
    return { answer: NO_APPROVED_CROSSROADS_ANSWER, usedKnowledge: false };
  }

  const block = formatPublishedKnowledgeForPrompt(args.knowledge);
  if (!block) {
    return { answer: NO_APPROVED_CROSSROADS_ANSWER, usedKnowledge: false };
  }

  const client = createLlmClient();
  const answer = await runChatCompletion(client, {
    system: ASK_SYSTEM,
    model: ANALYSIS_MODEL,
    maxTokens: 800,
    messages: [
      {
        role: "user",
        content: `PUBLISHED KNOWLEDGE:\n${block}\n\nQUESTION:\n${question}`,
      },
    ],
  });

  const cleaned = answer.trim();
  if (!cleaned) {
    return { answer: NO_APPROVED_CROSSROADS_ANSWER, usedKnowledge: false };
  }

  if (
    /don't have approved CrossRoads Connect information/i.test(cleaned) ||
    /do not have approved CrossRoads Connect information/i.test(cleaned)
  ) {
    return { answer: NO_APPROVED_CROSSROADS_ANSWER, usedKnowledge: false };
  }

  if (!/\bSource:\s*/i.test(cleaned)) {
    const fallbackSource =
      args.knowledge.facts[0]?.source_url ||
      args.knowledge.events[0]?.source_url ||
      "https://www.crossroadsconnect.us/";
    let path = fallbackSource;
    try {
      const u = new URL(fallbackSource);
      path = u.pathname === "/" ? u.hostname : `${u.hostname}${u.pathname}`;
    } catch {
      /* keep */
    }
    return {
      answer: `${cleaned}\n\nSource:\nCrossRoads Connect website — ${path}`,
      usedKnowledge: true,
    };
  }

  return { answer: cleaned, usedKnowledge: true };
}
