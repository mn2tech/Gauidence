import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  expertCatalogSchema,
  expertDefinitionSchema,
  type ExpertCatalogItem,
  type ExpertDefinition,
} from "./expert-schema";

const EXPERTS_DIR = path.join(process.cwd(), "data", "experts");

export type ExpertValidationIssue = {
  expertId?: string;
  message: string;
};

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
}

function checkUniqueIds(ids: string[], label: string, expertId: string, issues: ExpertValidationIssue[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({ expertId, message: `Duplicate ${label} id: ${id}` });
    }
    seen.add(id);
  }
}

function validateReferences(definition: ExpertDefinition, issues: ExpertValidationIssue[]): void {
  const topicIds = new Set(definition.knowledgeTopics.map((t) => t.id));
  const quizIds = new Set(definition.quizzes.map((q) => q.id));
  const moduleIds = new Set(definition.roadmap.map((m) => m.id));

  for (const module of definition.roadmap) {
    for (const topicId of module.lessonTopicIds) {
      if (!topicIds.has(topicId)) {
        issues.push({
          expertId: definition.id,
          message: `Module ${module.id} references missing topic id: ${topicId}`,
        });
      }
    }
    for (const quizId of module.quizIds) {
      if (!quizIds.has(quizId)) {
        issues.push({
          expertId: definition.id,
          message: `Module ${module.id} references missing quiz id: ${quizId}`,
        });
      }
    }
  }

  for (const topic of definition.knowledgeTopics) {
    for (const relatedId of topic.relatedTopicIds) {
      if (!topicIds.has(relatedId)) {
        issues.push({
          expertId: definition.id,
          message: `Topic ${topic.id} references missing related topic id: ${relatedId}`,
        });
      }
    }
  }

  for (const term of definition.glossary) {
    for (const relatedId of term.relatedTopicIds) {
      if (!topicIds.has(relatedId)) {
        issues.push({
          expertId: definition.id,
          message: `Glossary term ${term.term} references missing topic id: ${relatedId}`,
        });
      }
    }
  }

  for (const quiz of definition.quizzes) {
    if (quiz.moduleId && !moduleIds.has(quiz.moduleId)) {
      issues.push({
        expertId: definition.id,
        message: `Quiz ${quiz.id} references missing module id: ${quiz.moduleId}`,
      });
    }
    for (const question of quiz.questions) {
      if (question.correctOptionIndex >= question.options.length) {
        issues.push({
          expertId: definition.id,
          message: `Quiz ${quiz.id} question ${question.id} has invalid correctOptionIndex`,
        });
      }
    }
  }

  for (const scenario of definition.scenarios) {
    if (scenario.correctChoiceIndex >= scenario.choices.length) {
      issues.push({
        expertId: definition.id,
        message: `Scenario ${scenario.id} has invalid correctChoiceIndex`,
      });
    }
  }
}

function validateRoadmapOrdering(definition: ExpertDefinition, issues: ExpertValidationIssue[]): void {
  const orders = definition.roadmap.map((m) => m.order);
  const uniqueOrders = new Set(orders);
  if (uniqueOrders.size !== orders.length) {
    issues.push({
      expertId: definition.id,
      message: "Roadmap module order values must be unique",
    });
  }
}

function validateExpertFile(item: ExpertCatalogItem, issues: ExpertValidationIssue[]): void {
  const filePath = path.join(EXPERTS_DIR, item.file);
  if (!existsSync(filePath)) {
    issues.push({ expertId: item.id, message: `Referenced file missing: ${item.file}` });
    return;
  }

  const parsed = expertDefinitionSchema.safeParse(readJson(filePath));
  if (!parsed.success) {
    issues.push({
      expertId: item.id,
      message: `Invalid expert JSON: ${parsed.error.message}`,
    });
    return;
  }

  const definition = parsed.data;
  if (definition.id !== item.id) {
    issues.push({
      expertId: item.id,
      message: `Catalog id ${item.id} does not match file id ${definition.id}`,
    });
  }
  if (definition.version !== item.version) {
    issues.push({
      expertId: item.id,
      message: `Catalog version ${item.version} does not match file version ${definition.version}`,
    });
  }

  checkUniqueIds(
    definition.knowledgeTopics.map((t) => t.id),
    "knowledge topic",
    definition.id,
    issues
  );
  checkUniqueIds(definition.roadmap.map((m) => m.id), "roadmap module", definition.id, issues);
  checkUniqueIds(definition.quizzes.map((q) => q.id), "quiz", definition.id, issues);
  checkUniqueIds(definition.scenarios.map((s) => s.id), "scenario", definition.id, issues);
  checkUniqueIds(
    definition.interviewQuestions.map((q) => q.id),
    "interview question",
    definition.id,
    issues
  );

  validateRoadmapOrdering(definition, issues);
  validateReferences(definition, issues);
}

export function validateExpertsCatalog(): ExpertValidationIssue[] {
  const issues: ExpertValidationIssue[] = [];
  const catalogPath = path.join(EXPERTS_DIR, "catalog.json");

  if (!existsSync(catalogPath)) {
    issues.push({ message: "catalog.json not found in data/experts" });
    return issues;
  }

  const catalogParsed = expertCatalogSchema.safeParse(readJson(catalogPath));
  if (!catalogParsed.success) {
    issues.push({ message: `Invalid catalog.json: ${catalogParsed.error.message}` });
    return issues;
  }

  const catalog = catalogParsed.data;
  const expertIds = catalog.experts.map((e) => e.id);
  checkUniqueIds(expertIds, "expert", "catalog", issues);

  for (const item of catalog.experts) {
    validateExpertFile(item, issues);
  }

  return issues;
}
