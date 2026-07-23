import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  expertCatalogSchema,
  expertDefinitionSchema,
  type ExpertCatalog,
  type ExpertCatalogItem,
  type ExpertDefinition,
  type ExpertInterviewQuestion,
  type ExpertKnowledgeTopic,
  type ExpertQuiz,
  type ExpertRoadmapModule,
  type ExpertScenario,
  type ExpertStatus,
} from "./expert-schema";
import type { ExpertCatalogEntry, ExpertPublicView } from "./expert-types";

const EXPERTS_DIR = path.join(process.cwd(), "data", "experts");

type CachedExpert = {
  definition: ExpertDefinition | null;
  error: string | null;
};

const expertCache = new Map<string, CachedExpert>();
let catalogCache: ExpertCatalog | null = null;

function readJsonFile(filePath: string): unknown {
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw) as unknown;
}

function loadCatalogRaw(): ExpertCatalog {
  if (catalogCache) return catalogCache;
  const catalogPath = path.join(EXPERTS_DIR, "catalog.json");
  if (!existsSync(catalogPath)) {
    throw new Error("Expert catalog not found.");
  }
  const parsed = expertCatalogSchema.safeParse(readJsonFile(catalogPath));
  if (!parsed.success) {
    throw new Error(`Invalid expert catalog: ${parsed.error.message}`);
  }
  catalogCache = parsed.data;
  return catalogCache;
}

function loadExpertDefinition(item: ExpertCatalogItem): CachedExpert {
  const cached = expertCache.get(item.id);
  if (cached) return cached;

  const filePath = path.join(EXPERTS_DIR, item.file);
  if (!existsSync(filePath)) {
    const result: CachedExpert = {
      definition: null,
      error: `Referenced file missing: ${item.file}`,
    };
    expertCache.set(item.id, result);
    console.error(`[experts] ${item.id}: ${result.error}`);
    return result;
  }

  const parsed = expertDefinitionSchema.safeParse(readJsonFile(filePath));
  if (!parsed.success) {
    const result: CachedExpert = {
      definition: null,
      error: parsed.error.message,
    };
    expertCache.set(item.id, result);
    console.error(`[experts] ${item.id} validation failed:`, parsed.error.message);
    return result;
  }

  if (parsed.data.id !== item.id) {
    const result: CachedExpert = {
      definition: null,
      error: `Expert id mismatch: catalog=${item.id}, file=${parsed.data.id}`,
    };
    expertCache.set(item.id, result);
    console.error(`[experts] ${item.id}: ${result.error}`);
    return result;
  }

  if (parsed.data.version !== item.version) {
    const result: CachedExpert = {
      definition: null,
      error: `Version mismatch: catalog=${item.version}, file=${parsed.data.version}`,
    };
    expertCache.set(item.id, result);
    console.error(`[experts] ${item.id}: ${result.error}`);
    return result;
  }

  const result: CachedExpert = { definition: parsed.data, error: null };
  expertCache.set(item.id, result);
  return result;
}

function toPublicView(definition: ExpertDefinition): ExpertPublicView {
  const { systemPrompt: _systemPrompt, ...rest } = definition;
  return rest;
}

function withEffectiveStatus(
  item: ExpertCatalogItem,
  cached: CachedExpert
): ExpertCatalogEntry {
  const effectiveStatus: ExpertStatus = cached.error ? "unavailable" : item.status;
  return {
    ...item,
    effectiveStatus,
    validationError: cached.error ?? undefined,
  };
}

export function clearExpertCache(): void {
  catalogCache = null;
  expertCache.clear();
}

export function getExpertCatalog(): ExpertCatalogEntry[] {
  const catalog = loadCatalogRaw();
  return catalog.experts.map((item) =>
    withEffectiveStatus(item, loadExpertDefinition(item))
  );
}

export function getAvailableExperts(): ExpertCatalogEntry[] {
  return getExpertCatalog().filter((e) => e.effectiveStatus !== "unavailable");
}

export function getExpertCatalogItem(expertId: string): ExpertCatalogEntry | null {
  const item = getExpertCatalog().find((e) => e.id === expertId);
  return item ?? null;
}

export function getExpertById(expertId: string): ExpertDefinition | null {
  const item = loadCatalogRaw().experts.find((e) => e.id === expertId);
  if (!item) return null;
  const cached = loadExpertDefinition(item);
  return cached.definition;
}

export function getExpertPublicById(expertId: string): ExpertPublicView | null {
  const definition = getExpertById(expertId);
  return definition ? toPublicView(definition) : null;
}

export function getExpertRoadmap(expertId: string): ExpertRoadmapModule[] {
  const expert = getExpertById(expertId);
  if (!expert) return [];
  return [...expert.roadmap].sort((a, b) => a.order - b.order);
}

export function getExpertModule(
  expertId: string,
  moduleId: string
): ExpertRoadmapModule | null {
  return getExpertRoadmap(expertId).find((m) => m.id === moduleId) ?? null;
}

export function getExpertTopic(
  expertId: string,
  topicId: string
): ExpertKnowledgeTopic | null {
  const expert = getExpertById(expertId);
  return expert?.knowledgeTopics.find((t) => t.id === topicId) ?? null;
}

export function getExpertQuiz(expertId: string, quizId: string): ExpertQuiz | null {
  const expert = getExpertById(expertId);
  return expert?.quizzes.find((q) => q.id === quizId) ?? null;
}

export function getExpertScenario(
  expertId: string,
  scenarioId: string
): ExpertScenario | null {
  const expert = getExpertById(expertId);
  return expert?.scenarios.find((s) => s.id === scenarioId) ?? null;
}

export function getExpertInterviewQuestions(
  expertId: string
): ExpertInterviewQuestion[] {
  const expert = getExpertById(expertId);
  return expert?.interviewQuestions ?? [];
}

export function friendlyExpertError(expertId: string): string {
  const item = getExpertCatalogItem(expertId);
  if (!item) return "Expert not found.";
  if (item.effectiveStatus === "unavailable") {
    return "This expert is temporarily unavailable.";
  }
  return item.description;
}
