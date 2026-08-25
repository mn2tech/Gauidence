import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createLlmClient,
  runChatCompletion,
  ANALYSIS_MODEL,
} from "@/lib/analysis/llm";
import {
  MCPS_AUTHORITY,
  MCPS_PROJECT_SLUG,
  NO_VERIFIED_MCPS_ANSWER,
} from "@/lib/knowledge-studio/projects/constants";
import { loadKnowledgeProject } from "@/lib/knowledge-studio/projects/loadProject";
import { retrievePublishedKnowledge } from "@/lib/knowledge-studio/projects/retrieve";
import { schoolsMatch } from "./dates";
import type { ParentSchoolContext } from "./types";

const ASK_SYSTEM = `You are Gideon helping an MCPS parent in Guardian.

Rules:
- Answer ONLY from the PUBLISHED knowledge blocks provided.
- The parent's school and grade are already known — apply them automatically.
- Prefer school-specific published knowledge, then grade-relevant, then district-wide.
- Never invent boundaries, bus stops, grades, or private student information.
- Never present scraped information as Guardian's own authority — MCPS remains the authority.
- If published knowledge does not support an answer, reply exactly:
${NO_VERIFIED_MCPS_ANSWER}
- Keep answers concise (2–8 sentences).
- End successful answers with:
Source:
<Authority>
<Source title>
<source URL when available>
- Never mention drafts, embeddings, Knowledge Studio, or internal systems.`;

function appendSource(
  answer: string,
  hits: Array<{
    source_name: string;
    item: { authority: string | null; source_url: string | null; title: string };
  }>
): string {
  if (/\bSource:\s*/i.test(answer)) return answer;
  const top = hits[0];
  if (!top) return answer;
  const lines = [
    "Source:",
    top.item.authority ?? MCPS_AUTHORITY,
    top.source_name || top.item.title,
  ];
  if (top.item.source_url) lines.push(top.item.source_url);
  return `${answer.trim()}\n\n${lines.join("\n")}`;
}

export async function answerParentSchoolQuestion(args: {
  admin: SupabaseClient;
  question: string;
  context: ParentSchoolContext;
  now?: Date;
}): Promise<{
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
}> {
  const question = args.question.trim().slice(0, 1000);
  if (!question) {
    return {
      answer: NO_VERIFIED_MCPS_ANSWER,
      usedKnowledge: false,
      sources_used: [],
    };
  }

  const loaded = await loadKnowledgeProject(args.admin, MCPS_PROJECT_SLUG);
  if (!loaded) {
    return {
      answer: NO_VERIFIED_MCPS_ANSWER,
      usedKnowledge: false,
      sources_used: [],
    };
  }

  const hits = await retrievePublishedKnowledge({
    admin: args.admin,
    projectId: loaded.project.id,
    question: `${question}\nSchool: ${args.context.school_name}\nGrade: ${args.context.grade_level}`,
    schoolHint: args.context.school_name,
    limit: 10,
  });

  // Soft filter: drop other-school-only hits (fuzzy school name match).
  const filtered = hits.filter((h) => {
    const school = h.item.school?.trim();
    if (!school) return true;
    return schoolsMatch(args.context.school_name, school);
  });

  const sources_used = filtered.map((h) => ({
    id: h.item.id,
    title: h.item.title,
    source_name: h.source_name,
    source_url: h.item.source_url,
    authority: h.item.authority,
    category: h.item.category,
  }));

  if (!filtered.length) {
    return {
      answer: NO_VERIFIED_MCPS_ANSWER,
      usedKnowledge: false,
      sources_used: [],
    };
  }

  const block = filtered
    .map((h, i) => {
      const item = h.item;
      return [
        `[${i + 1}] ${item.title}`,
        item.content,
        `Category: ${item.category}`,
        item.school ? `School: ${item.school}` : "School: district-wide",
        item.grade_level ? `Grade: ${item.grade_level}` : null,
        `Authority: ${item.authority ?? MCPS_AUTHORITY}`,
        `Source: ${h.source_name}`,
        item.source_url ? `URL: ${item.source_url}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const client = createLlmClient();
  const answer = await runChatCompletion(client, {
    system: ASK_SYSTEM,
    model: ANALYSIS_MODEL,
    maxTokens: 900,
    messages: [
      {
        role: "user",
        content: [
          `PARENT CONTEXT:`,
          `School: ${args.context.school_name}`,
          `Grade: ${args.context.grade_level}`,
          `Today: ${(args.now ?? new Date()).toISOString().slice(0, 10)}`,
          ``,
          `PUBLISHED KNOWLEDGE:`,
          block,
          ``,
          `QUESTION:`,
          question,
        ].join("\n"),
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
    };
  }

  return {
    answer: appendSource(cleaned, filtered),
    usedKnowledge: true,
    sources_used,
  };
}
