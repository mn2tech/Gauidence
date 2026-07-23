import type { ExpertDefinition } from "./expert-schema";
import type { ExpertKnowledgeSearchResult } from "./expert-types";
import { getExpertById } from "./load-expert";

export type ExpertKnowledgeSearchParams = {
  expertId: string;
  query: string;
  limit?: number;
  moduleId?: string;
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

function scoreText(haystack: string, tokens: string[], phrases: string[]): number {
  const normalized = normalizeText(haystack);
  if (!normalized) return 0;
  let score = 0;
  for (const token of tokens) {
    if (normalized.includes(token)) score += 1;
  }
  for (const phrase of phrases) {
    if (phrase.length > 2 && normalized.includes(phrase)) score += 3;
  }
  return score;
}

function topicContent(topic: ExpertDefinition["knowledgeTopics"][number]): string {
  return [
    topic.summary,
    ...topic.details,
    ...topic.keyPoints,
    ...topic.commonMistakes,
    ...topic.starterQuestions,
    ...topic.examples.map((e) => `${e.title} ${e.description}`),
  ].join("\n");
}

function glossaryContent(
  expert: ExpertDefinition,
  topicId: string
): string {
  const terms = expert.glossary.filter((g) => g.relatedTopicIds.includes(topicId));
  return terms.map((g) => `${g.term}: ${g.definition}`).join("\n");
}

export function searchExpertKnowledge(
  params: ExpertKnowledgeSearchParams
): ExpertKnowledgeSearchResult[] {
  const expert = getExpertById(params.expertId);
  if (!expert) return [];

  const limit = params.limit ?? 5;
  const query = params.query.trim();
  if (!query) return [];

  const tokens = tokenize(query);
  const normalizedQuery = normalizeText(query);
  const phrases = normalizedQuery.length > 2 ? [normalizedQuery] : [];

  const moduleTopicIds = params.moduleId
    ? new Set(
        expert.roadmap.find((m) => m.id === params.moduleId)?.lessonTopicIds ?? []
      )
    : null;

  const scored: ExpertKnowledgeSearchResult[] = [];

  for (const topic of expert.knowledgeTopics) {
    if (moduleTopicIds && moduleTopicIds.size > 0 && !moduleTopicIds.has(topic.id)) {
      continue;
    }

    let score = 0;
    score += scoreText(topic.title, tokens, phrases) * 4;
    score += scoreText(topic.category, tokens, phrases) * 2;
    score += scoreText(topic.summary, tokens, phrases) * 2;
    score += scoreText(topicContent(topic), tokens, phrases);
    score += scoreText(glossaryContent(expert, topic.id), tokens, phrases);

    for (const starter of topic.starterQuestions) {
      score += scoreText(starter, tokens, phrases) * 2;
    }

    if (score <= 0) continue;

    const related = topic.relatedTopicIds
      .map((id) => expert.knowledgeTopics.find((t) => t.id === id))
      .filter(Boolean)
      .slice(0, 2);

    const relatedContent = related
      .map((t) => `${t!.title}: ${t!.summary}`)
      .join("\n");

    scored.push({
      topicId: topic.id,
      title: topic.title,
      score,
      summary: topic.summary,
      content: [topicContent(topic), relatedContent].filter(Boolean).join("\n\n"),
    });
  }

  for (const term of expert.glossary) {
    const text = `${term.term} ${term.definition} ${term.category}`;
    const score = scoreText(text, tokens, phrases) * 2;
    if (score <= 0) continue;
    scored.push({
      topicId: term.relatedTopicIds[0] ?? `glossary:${term.term}`,
      title: term.term,
      score,
      summary: term.definition,
      content: term.definition,
    });
  }

  const deduped = new Map<string, ExpertKnowledgeSearchResult>();
  for (const row of scored.sort((a, b) => b.score - a.score)) {
    const key = `${row.topicId}:${row.title}`;
    const existing = deduped.get(key);
    if (!existing || existing.score < row.score) {
      deduped.set(key, row);
    }
  }

  return [...deduped.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
