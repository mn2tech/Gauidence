import "server-only";

import {
  createLlmClient,
  runChatCompletion,
  ANALYSIS_MODEL,
} from "@/lib/analysis/llm";
import type { PublishedOrgKnowledge } from "./retrieve";
import { formatPublishedKnowledgeForPrompt } from "./retrieve";
import { formatEasternNow, wantsNextUpcomingEvent } from "./formatTime";
import {
  NO_APPROVED_CROSSROADS_ANSWER,
  NO_UPCOMING_CROSSROADS_EVENT,
  scopeKnowledgeForQuestion,
  withEventStatusLabels,
} from "./eventScope";

export {
  NO_APPROVED_CROSSROADS_ANSWER,
  NO_UPCOMING_CROSSROADS_EVENT,
  scopeKnowledgeForQuestion,
} from "./eventScope";

const ASK_SYSTEM = `You are Gideon answering for the public CrossRoads Connect page in Guardian.

Rules:
- Answer ONLY from the PUBLISHED knowledge blocks provided.
- Do not use general world knowledge.
- Do not invent events, fees, locations, speakers, RSVP links, or contact details.
- Respect CURRENT TIME (Eastern). Never call a past or finished event the "next" event.
- Events marked STATUS: PAST are finished — do not present them as upcoming.
- If the user asks for the next/upcoming event and only PAST events are listed (or none), say there is no published upcoming event.
- If the published knowledge does not support an answer, reply exactly:
${NO_APPROVED_CROSSROADS_ANSWER}
- Keep answers concise (2–6 sentences) unless listing event details.
- Event times: ALWAYS use the "When (America/New_York)" line. Say times in Eastern Time (e.g. 8:45 AM). NEVER say UTC, GMT, or Zulu. Never quote raw ISO timestamps to the user.
- End every successful answer with exactly one source block:
Source:
CrossRoads Connect website — https://www.crossroadsconnect.us/events
(use the most relevant full https source_url from the knowledge blocks — never a bare path like /events)
- Do not repeat the Source block.
- Never mention drafts, review status, RAG, or internal systems.`;

/** Expand relative / bare CrossRoads source paths to absolute https URLs. */
function withAbsoluteSourceUrls(answer: string): string {
  return answer
    .replace(
      /(CrossRoads Connect website\s*[—\-–]\s*)(\/[^\s]*)/gi,
      "CrossRoads Connect website — https://www.crossroadsconnect.us$2"
    )
    .replace(
      /(CrossRoads Connect website\s*[—\-–]\s*)(?!https?:\/\/)(www\.[^\s]+|crossroadsconnect\.us[^\s]*)/gi,
      (_m, label: string, host: string) => `${label}https://${host}`
    );
}

function appendSource(
  answer: string,
  knowledge: PublishedOrgKnowledge
): string {
  const fallbackSource =
    knowledge.facts[0]?.source_url ||
    knowledge.events[0]?.source_url ||
    "https://www.crossroadsconnect.us/";
  let url = fallbackSource;
  try {
    url = new URL(fallbackSource).href;
  } catch {
    /* keep */
  }
  const withSource = /\bSource:\s*/i.test(answer)
    ? answer
    : `${answer}\n\nSource:\nCrossRoads Connect website — ${url}`;
  return withAbsoluteSourceUrls(withSource);
}

export async function answerCrossroadsPublicQuestion(args: {
  question: string;
  knowledge: PublishedOrgKnowledge;
  now?: Date;
}): Promise<{ answer: string; usedKnowledge: boolean }> {
  const question = args.question.trim().slice(0, 1000);
  const now = args.now ?? new Date();
  const nowMs = now.getTime();

  if (!question) {
    return { answer: NO_APPROVED_CROSSROADS_ANSWER, usedKnowledge: false };
  }

  const scoped = scopeKnowledgeForQuestion(args.knowledge, question, nowMs);

  if (
    wantsNextUpcomingEvent(question) &&
    scoped.events.length === 0 &&
    args.knowledge.events.length > 0
  ) {
    return {
      answer: appendSource(NO_UPCOMING_CROSSROADS_EVENT, args.knowledge),
      usedKnowledge: true,
    };
  }

  const labeled = withEventStatusLabels(scoped, nowMs);
  const block = formatPublishedKnowledgeForPrompt(labeled);
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
        content: `CURRENT TIME (America/New_York): ${formatEasternNow(now)}\n\nPUBLISHED KNOWLEDGE:\n${block}\n\nQUESTION:\n${question}`,
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

  return {
    answer: appendSource(cleaned, scoped.events.length ? scoped : args.knowledge),
    usedKnowledge: true,
  };
}
