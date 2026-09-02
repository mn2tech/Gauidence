import "server-only";

import {
  createLlmClient,
  runChatCompletion,
  ANALYSIS_MODEL,
} from "@/lib/analysis/llm";
import type { PublishedSummitKnowledge } from "./types";
import { formatSummitKnowledgeForPrompt } from "./retrieve";

export const NO_SUMMIT_INFORMATION =
  "I don't have verified summit information to answer that question yet. Check back as more session content is captured, or ask about the organizations and sessions already published.";

const SUMMIT_ASK_SYSTEM = `You are Gideon answering for the public 2026 Small Business Government Contracting Summit hub in Guardian.

Rules:
- Answer ONLY from the SUMMIT KNOWLEDGE blocks provided below.
- Do not use general world knowledge unless clearly labeled as NM2TECH ANALYSIS.
- Do not invent email addresses, phone numbers, contract vehicles, opportunities, or company requirements.
- Never present assumptions as statements made by a speaker.
- Clearly distinguish information types in your answer:
  • VERIFIED SUMMIT INFORMATION — from captured summit materials (source_type: summit)
  • PUBLICLY VERIFIED INFORMATION — official public sources (source_type: public)
  • COMMUNITY CONTRIBUTION — approved attendee submissions (source_type: community). When using these, say something like "An approved community contribution from the summit indicates…" Do not imply the information was stated by an official speaker unless evidence establishes that.
  • GUARDIAN INSIGHT — synthesis or recommended actions (source_type: guardian_insight). Never present these as speaker statements.
- If the knowledge does not support an answer, reply exactly:
${NO_SUMMIT_INFORMATION}
- Keep answers concise (2–8 sentences) unless listing multiple organizations.
- When recommending prime contractors, explain WHY using available evidence.
- End successful answers with a source attribution line:
Source: [source label from knowledge block]
- Do not mention drafts, review status, RAG, embeddings, or internal systems.
- Do not reveal private capture notes, priorities, or relationship assessments.`;

export async function answerSummitPublicQuestion(args: {
  question: string;
  knowledge: PublishedSummitKnowledge;
}): Promise<{ answer: string; usedKnowledge: boolean }> {
  const question = args.question.trim().slice(0, 1000);
  if (!question) {
    return { answer: NO_SUMMIT_INFORMATION, usedKnowledge: false };
  }

  const block = formatSummitKnowledgeForPrompt(args.knowledge);
  if (!block) {
    return { answer: NO_SUMMIT_INFORMATION, usedKnowledge: false };
  }

  const client = createLlmClient();
  const answer = await runChatCompletion(client, {
    system: SUMMIT_ASK_SYSTEM,
    model: ANALYSIS_MODEL,
    maxTokens: 900,
    messages: [
      {
        role: "user",
        content: `SUMMIT KNOWLEDGE:\n${block}\n\nQUESTION:\n${question}`,
      },
    ],
  });

  const cleaned = answer.trim();
  if (!cleaned) {
    return { answer: NO_SUMMIT_INFORMATION, usedKnowledge: false };
  }

  if (
    /don't have verified summit information/i.test(cleaned) ||
    /do not have verified summit information/i.test(cleaned)
  ) {
    return { answer: NO_SUMMIT_INFORMATION, usedKnowledge: false };
  }

  const withSource = /\bSource:\s*/i.test(cleaned)
    ? cleaned
    : `${cleaned}\n\nSource: ${args.knowledge.space.name} — Summit materials`;

  return { answer: withSource, usedKnowledge: true };
}
