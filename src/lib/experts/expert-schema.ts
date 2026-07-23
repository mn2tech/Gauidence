import { z } from "zod";

export const expertStatusSchema = z.enum([
  "active",
  "beta",
  "development",
  "coming-soon",
  "unavailable",
  "archived",
]);

export const expertCategorySchema = z.enum([
  "Professional",
  "Learning",
  "Business",
  "Personal",
]);

export const moduleStatusSchema = z.enum(["draft", "published", "archived"]);

export const sourceTypeSchema = z.enum([
  "guardian-curated",
  "licensed-content",
  "public-source",
  "organization-document",
  "user-document",
]);

export const difficultySchema = z.enum(["beginner", "intermediate", "advanced"]);

export const questionTypeSchema = z.enum(["multiple-choice", "true-false"]);

export const expertCapabilitySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1),
  route: z.string().min(1),
  enabled: z.boolean().default(true),
});

export const expertThemeSchema = z.object({
  accent: z.string().min(1),
  style: z.string().min(1),
});

export const expertRoadmapModuleSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().min(1),
  estimatedMinutes: z.number().int().positive().optional(),
  learningObjectives: z.array(z.string()).default([]),
  lessonTopicIds: z.array(z.string()).default([]),
  quizIds: z.array(z.string()).default([]),
  status: moduleStatusSchema.default("published"),
});

export const expertKnowledgeExampleSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
});

export const expertKnowledgeTopicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  summary: z.string().min(1),
  details: z.array(z.string()).default([]),
  examples: z.array(expertKnowledgeExampleSchema).default([]),
  keyPoints: z.array(z.string()).default([]),
  commonMistakes: z.array(z.string()).default([]),
  starterQuestions: z.array(z.string()).default([]),
  relatedTopicIds: z.array(z.string()).default([]),
  sourceType: sourceTypeSchema.default("guardian-curated"),
});

export const expertGlossaryItemSchema = z.object({
  term: z.string().min(1),
  definition: z.string().min(1),
  category: z.string().min(1),
  relatedTopicIds: z.array(z.string()).default([]),
});

export const expertQuizQuestionSchema = z.object({
  id: z.string().min(1),
  type: questionTypeSchema,
  question: z.string().min(1),
  options: z.array(z.string()).min(2),
  correctOptionIndex: z.number().int().nonnegative(),
  explanation: z.string().min(1),
});

export const expertQuizSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  moduleId: z.string().min(1).optional(),
  description: z.string().min(1),
  passingScore: z.number().int().min(0).max(100).default(70),
  questions: z.array(expertQuizQuestionSchema).min(1),
});

export const expertScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  difficulty: difficultySchema,
  category: z.string().min(1),
  fictional: z.boolean().default(true),
  notice: z.string().optional(),
  context: z.string().min(1),
  records: z.union([z.array(z.record(z.string(), z.unknown())), z.record(z.string(), z.unknown())]).optional(),
  question: z.string().min(1),
  choices: z.array(z.string()).min(2),
  correctChoiceIndex: z.number().int().nonnegative(),
  explanation: z.string().min(1),
  learningPoints: z.array(z.string()).default([]),
});

export const expertInterviewQuestionSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  difficulty: difficultySchema,
  question: z.string().min(1),
  answerGuide: z.array(z.string()).default([]),
  followUpQuestions: z.array(z.string()).default([]),
});

export const expertDefinitionSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  category: expertCategorySchema,
  icon: z.string().min(1),
  status: expertStatusSchema,
  description: z.string().min(1),
  longDescription: z.string().min(1),
  primaryGoal: z.string().min(1),
  disclaimer: z.string().optional(),
  theme: expertThemeSchema,
  capabilities: z.array(expertCapabilitySchema).default([]),
  systemPrompt: z.string().min(1),
  responseRules: z.array(z.string()).default([]),
  starterQuestions: z.array(z.string()).default([]),
  roadmap: z.array(expertRoadmapModuleSchema).default([]),
  knowledgeTopics: z.array(expertKnowledgeTopicSchema).default([]),
  glossary: z.array(expertGlossaryItemSchema).default([]),
  quizzes: z.array(expertQuizSchema).default([]),
  scenarios: z.array(expertScenarioSchema).default([]),
  interviewQuestions: z.array(expertInterviewQuestionSchema).default([]),
});

export const expertCatalogItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  category: expertCategorySchema,
  description: z.string().min(1),
  icon: z.string().min(1),
  status: expertStatusSchema,
  version: z.string().min(1),
  file: z.string().min(1),
});

export const expertCatalogSchema = z.object({
  experts: z.array(expertCatalogItemSchema),
});

export type ExpertStatus = z.infer<typeof expertStatusSchema>;
export type ExpertCategory = z.infer<typeof expertCategorySchema>;
export type ModuleStatus = z.infer<typeof moduleStatusSchema>;
export type ExpertCapability = z.infer<typeof expertCapabilitySchema>;
export type ExpertRoadmapModule = z.infer<typeof expertRoadmapModuleSchema>;
export type ExpertKnowledgeTopic = z.infer<typeof expertKnowledgeTopicSchema>;
export type ExpertGlossaryItem = z.infer<typeof expertGlossaryItemSchema>;
export type ExpertQuiz = z.infer<typeof expertQuizSchema>;
export type ExpertQuizQuestion = z.infer<typeof expertQuizQuestionSchema>;
export type ExpertScenario = z.infer<typeof expertScenarioSchema>;
export type ExpertInterviewQuestion = z.infer<typeof expertInterviewQuestionSchema>;
export type ExpertDefinition = z.infer<typeof expertDefinitionSchema>;
export type ExpertCatalogItem = z.infer<typeof expertCatalogItemSchema>;
export type ExpertCatalog = z.infer<typeof expertCatalogSchema>;
