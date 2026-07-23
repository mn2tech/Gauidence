import type { ExpertDefinition } from "./expert-schema";
import type { ExpertKnowledgeSearchResult } from "./expert-types";

export const GUARDIAN_GLOBAL_SAFETY_INSTRUCTIONS = `You are part of Guardian, a personal knowledge and guidance platform.
Safety rules:
- Do not provide harmful, illegal, or unethical instructions.
- Be honest about uncertainty and scope limits.
- Respect user privacy; do not request unnecessary sensitive data.
- If a question is outside the expert's scope, say so clearly and suggest appropriate next steps.`;

export type ExpertPromptMessage = {
  role: "user" | "assistant";
  content: string;
};

export type BuildExpertPromptParams = {
  expert: ExpertDefinition;
  question: string;
  moduleId?: string;
  knowledge: ExpertKnowledgeSearchResult[];
  history?: ExpertPromptMessage[];
};

export function buildExpertPrompt(params: BuildExpertPromptParams): {
  system: string;
  messages: ExpertPromptMessage[];
} {
  const { expert, question, moduleId, knowledge, history = [] } = params;

  const moduleContext = moduleId
    ? expert.roadmap.find((m) => m.id === moduleId)
    : null;

  const knowledgeBlock =
    knowledge.length > 0
      ? knowledge
          .map(
            (k, i) =>
              `[Topic ${i + 1}: ${k.title}]\nSummary: ${k.summary}\n${k.content}`
          )
          .join("\n\n")
      : "No specific knowledge topics matched this question.";

  const system = [
    GUARDIAN_GLOBAL_SAFETY_INSTRUCTIONS,
    "",
    `Expert: ${expert.name}`,
    expert.disclaimer ? `Disclaimer: ${expert.disclaimer}` : "",
    "",
    expert.systemPrompt,
    "",
    "Response rules:",
    ...expert.responseRules.map((rule) => `- ${rule}`),
    moduleContext
      ? `\nActive module context:\n- ${moduleContext.title}: ${moduleContext.description}\n- Objectives: ${moduleContext.learningObjectives.join("; ")}`
      : "",
    "",
    "Relevant expert knowledge:",
    knowledgeBlock,
  ]
    .filter(Boolean)
    .join("\n");

  const messages: ExpertPromptMessage[] = [
    ...history.slice(-8),
    { role: "user", content: question },
  ];

  return { system, messages };
}

export function buildInterviewFeedbackPrompt(args: {
  expert: ExpertDefinition;
  question: string;
  answerGuide: string[];
  userResponse: string;
}): { system: string; messages: ExpertPromptMessage[] } {
  const system = [
    GUARDIAN_GLOBAL_SAFETY_INSTRUCTIONS,
    "",
    `You are evaluating an interview practice response for ${args.expert.name}.`,
    args.expert.disclaimer ? `Disclaimer: ${args.expert.disclaimer}` : "",
    "",
    "Provide constructive feedback on structure, completeness, and clarity.",
    "Do not quote the full answer guide verbatim.",
    "Highlight strengths, gaps, and one concrete improvement.",
    "",
    "Evaluation context (server-side only):",
    ...args.answerGuide.map((line) => `- ${line}`),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    system,
    messages: [
      {
        role: "user",
        content: `Interview question:\n${args.question}\n\nUser response:\n${args.userResponse}`,
      },
    ],
  };
}
