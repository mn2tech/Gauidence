import "server-only";

import {
  createLlmClient,
  runChatCompletion,
  ANALYSIS_MODEL,
} from "@/lib/analysis/llm";
import { MCPS_AUTHORITY, NO_VERIFIED_MCPS_ANSWER } from "./constants";
import {
  formatHitsForPrompt,
  retrievePublishedKnowledge,
  type RetrievePublishedArgs,
} from "./retrieve";
import type { RetrievalHit } from "./types";

const ASK_SYSTEM = `You are Gideon answering from a curated public knowledge project in Guardian Knowledge Studio (Test Gideon).

Rules:
- Answer ONLY from the PUBLISHED knowledge blocks provided.
- Do not use general world knowledge to invent district policies.
- Never present scraped information as Guardian's own authoritative statement.
- The authority remains the source organization (e.g. Montgomery County Public Schools).
- Prefer school-specific published knowledge over district knowledge when both apply.
- If the published knowledge does not support an answer, reply exactly:
${NO_VERIFIED_MCPS_ANSWER}
- Keep answers concise (2–8 sentences).
- End every successful answer with a Source block:
Source:
<Authority>
<Source title>
(include the source URL on the next line when available)
- Never mention drafts, review queues, RAG, or internal systems.
- For school assignment questions, direct parents to the official MCPS school-assignment service when the knowledge mentions it. Do not invent boundary determinations.`;

function appendSource(answer: string, hits: RetrievalHit[]): string {
  if (/\bSource:\s*/i.test(answer)) return answer;
  const top = hits[0];
  if (!top) return answer;
  const authority = top.item.authority ?? MCPS_AUTHORITY;
  const lines = [
    "Source:",
    authority,
    top.source_name,
  ];
  if (top.item.source_url) lines.push(top.item.source_url);
  return `${answer.trim()}\n\n${lines.join("\n")}`;
}

export type TestGideonResult = {
  answer: string;
  usedKnowledge: boolean;
  sources_used: Array<{
    id: string;
    title: string;
    source_name: string;
    source_url: string | null;
    authority: string | null;
    category: string;
  }>;
  retrieval: Array<{
    source: string;
    category: string;
    relevance: number;
    publication_status: string;
    title: string;
  }>;
};

export async function answerProjectTestQuestion(
  args: RetrievePublishedArgs & { authorityDefault?: string }
): Promise<TestGideonResult> {
  const question = args.question.trim().slice(0, 1000);
  if (!question) {
    return {
      answer: NO_VERIFIED_MCPS_ANSWER,
      usedKnowledge: false,
      sources_used: [],
      retrieval: [],
    };
  }

  const hits = await retrievePublishedKnowledge({
    admin: args.admin,
    projectId: args.projectId,
    question,
    schoolHint: args.schoolHint,
    limit: args.limit ?? 10,
  });

  const retrieval = hits.map((h) => ({
    source: h.source_name,
    category: h.item.category,
    relevance: h.relevance,
    publication_status: h.publication_status,
    title: h.item.title,
  }));

  const sources_used = hits.map((h) => ({
    id: h.item.id,
    title: h.item.title,
    source_name: h.source_name,
    source_url: h.item.source_url,
    authority: h.item.authority,
    category: h.item.category,
  }));

  const block = formatHitsForPrompt(hits);
  if (!block) {
    return {
      answer: NO_VERIFIED_MCPS_ANSWER,
      usedKnowledge: false,
      sources_used: [],
      retrieval,
    };
  }

  const client = createLlmClient();
  const answer = await runChatCompletion(client, {
    system: ASK_SYSTEM,
    model: ANALYSIS_MODEL,
    maxTokens: 900,
    messages: [
      {
        role: "user",
        content: `PUBLISHED KNOWLEDGE:\n${block}\n\nQUESTION:\n${question}`,
      },
    ],
  });

  const cleaned = answer.trim();
  if (
    !cleaned ||
    /couldn'?t find a verified answer/i.test(cleaned) ||
    /could not find a verified answer/i.test(cleaned)
  ) {
    return {
      answer: NO_VERIFIED_MCPS_ANSWER,
      usedKnowledge: false,
      sources_used,
      retrieval,
    };
  }

  return {
    answer: appendSource(cleaned, hits),
    usedKnowledge: true,
    sources_used,
    retrieval,
  };
}
