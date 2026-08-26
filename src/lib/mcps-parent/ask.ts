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
import {
  displayContextLabel,
  resolveQuestionContexts,
} from "./family";
import type { ParentActiveView, ParentSchoolContext } from "./types";

const ASK_SYSTEM = `You are Gideon helping an MCPS parent in Guardian.

Rules:
- Answer ONLY from the PUBLISHED knowledge blocks provided.
- The parent's school/grade context(s) are already known — apply them automatically.
- When multiple children/schools are in scope, organize the answer by child/school, then district-wide.
- Prefer school-specific published knowledge, then grade-relevant, then district-wide.
- Never invent boundaries, bus stops, grades, or private student information.
- Never present scraped information as Guardian's own authority — MCPS remains the authority.
- Friendly labels (e.g. "Matthew") refer to the parent's saved school profiles — use them in the answer when helpful, but cite MCPS schools as the authority.
- If published knowledge does not support an answer, reply exactly:
${NO_VERIFIED_MCPS_ANSWER}
- Keep answers concise (2–10 sentences or short bullets).
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

async function retrieveForContexts(args: {
  admin: SupabaseClient;
  projectId: string;
  question: string;
  contexts: ParentSchoolContext[];
}): Promise<
  Array<{
    item: {
      id: string;
      title: string;
      content: string;
      category: string;
      school: string | null;
      grade_level: string | null;
      authority: string | null;
      source_url: string | null;
    };
    source_name: string;
  }>
> {
  const byId = new Map<
    string,
    {
      item: {
        id: string;
        title: string;
        content: string;
        category: string;
        school: string | null;
        grade_level: string | null;
        authority: string | null;
        source_url: string | null;
      };
      source_name: string;
      relevance: number;
    }
  >();

  for (const ctx of args.contexts) {
    const hits = await retrievePublishedKnowledge({
      admin: args.admin,
      projectId: args.projectId,
      question: `${args.question}\nSchool: ${ctx.school_name}\nGrade: ${ctx.grade_level}`,
      schoolHint: ctx.school_name,
      limit: 10,
    });
    for (const h of hits) {
      const school = h.item.school?.trim();
      if (school && !schoolsMatch(ctx.school_name, school)) continue;
      const prev = byId.get(h.item.id);
      if (!prev || h.relevance > prev.relevance) {
        byId.set(h.item.id, {
          item: {
            id: h.item.id,
            title: h.item.title,
            content: h.item.content,
            category: h.item.category,
            school: h.item.school,
            grade_level: h.item.grade_level,
            authority: h.item.authority,
            source_url: h.item.source_url,
          },
          source_name: h.source_name,
          relevance: h.relevance,
        });
      }
    }
  }

  return [...byId.values()]
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 12)
    .map(({ item, source_name }) => ({ item, source_name }));
}

export async function answerParentSchoolQuestion(args: {
  admin: SupabaseClient;
  question: string;
  /** @deprecated Prefer contexts + activeView */
  context?: ParentSchoolContext;
  contexts?: ParentSchoolContext[];
  activeView?: ParentActiveView;
  now?: Date;
}): Promise<{
  answer: string;
  usedKnowledge: boolean;
  scope: {
    mode: "all" | "single";
    reason: string;
    contexts: Array<{ id: string; label: string; school_name: string; grade_level: string }>;
  };
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
  const contexts =
    args.contexts?.length
      ? args.contexts
      : args.context
        ? [args.context]
        : [];

  if (!question || !contexts.length) {
    return {
      answer: NO_VERIFIED_MCPS_ANSWER,
      usedKnowledge: false,
      scope: { mode: "all", reason: "none", contexts: [] },
      sources_used: [],
    };
  }

  const primary = contexts.find((c) => c.is_primary) ?? contexts[0]!;
  const resolved = resolveQuestionContexts({
    question,
    contexts,
    activeView: args.activeView ?? "all",
    primaryId: primary.id,
  });

  const loaded = await loadKnowledgeProject(args.admin, MCPS_PROJECT_SLUG);
  if (!loaded) {
    return {
      answer: NO_VERIFIED_MCPS_ANSWER,
      usedKnowledge: false,
      scope: {
        mode: resolved.mode,
        reason: resolved.reason,
        contexts: resolved.contexts.map((c) => ({
          id: c.id,
          label: displayContextLabel(c),
          school_name: c.school_name,
          grade_level: c.grade_level,
        })),
      },
      sources_used: [],
    };
  }

  const filtered = await retrieveForContexts({
    admin: args.admin,
    projectId: loaded.project.id,
    question,
    contexts: resolved.contexts,
  });

  const sources_used = filtered.map((h) => ({
    id: h.item.id,
    title: h.item.title,
    source_name: h.source_name,
    source_url: h.item.source_url,
    authority: h.item.authority,
    category: h.item.category,
  }));

  const scopeMeta = {
    mode: resolved.mode,
    reason: resolved.reason,
    contexts: resolved.contexts.map((c) => ({
      id: c.id,
      label: displayContextLabel(c),
      school_name: c.school_name,
      grade_level: c.grade_level,
    })),
  };

  if (!filtered.length) {
    return {
      answer: NO_VERIFIED_MCPS_ANSWER,
      usedKnowledge: false,
      scope: scopeMeta,
      sources_used: [],
    };
  }

  const parentContextBlock =
    resolved.mode === "all"
      ? [
          `PARENT CONTEXTS (family view):`,
          ...resolved.contexts.map(
            (c) =>
              `- ${displayContextLabel(c)}: ${c.school_name}, Grade ${c.grade_level}`
          ),
        ].join("\n")
      : [
          `PARENT CONTEXT:`,
          `Label: ${displayContextLabel(resolved.contexts[0]!)}`,
          `School: ${resolved.contexts[0]!.school_name}`,
          `Grade: ${resolved.contexts[0]!.grade_level}`,
        ].join("\n");

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
    maxTokens: 1100,
    messages: [
      {
        role: "user",
        content: [
          parentContextBlock,
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
      scope: scopeMeta,
      sources_used,
    };
  }

  return {
    answer: appendSource(cleaned, filtered),
    usedKnowledge: true,
    scope: scopeMeta,
    sources_used,
  };
}
