import type { ResponseDepth } from "./types";
import {
  classifyOrchestrationDepth,
  orchestrationDepthToLegacy,
  type OrchestrationResponseDepth,
} from "@/lib/gideon/request-router";

export type { OrchestrationResponseDepth };

const DEPTH_2 =
  /\b(tell me more|more detail|a bit more|context|essentially|supporting)\b/i;

/**
 * Classify how deep the answer should be.
 * Default is Depth 1 / short (direct answer only).
 * Aligns with orchestration depths: short → 1, explain → 3, deep → 4.
 * Depth 2 remains for soft "tell me more" without a full explanation ask.
 */
export function classifyResponseDepth(question: string): ResponseDepth {
  const q = question.trim();
  if (!q) return 1;
  const orch = classifyOrchestrationDepth(q);
  if (orch === "deep") return 4;
  if (orch === "explain") return 3;
  if (DEPTH_2.test(q)) return 2;
  return orchestrationDepthToLegacy(orch);
}

/** Map numeric depth → orchestration label. */
export function legacyDepthToOrchestration(
  depth: ResponseDepth
): OrchestrationResponseDepth {
  if (depth >= 4) return "deep";
  if (depth >= 3) return "explain";
  return "short";
}

export function responseDepthSystemNote(depth: ResponseDepth): string {
  switch (depth) {
    case 1:
      return `RESPONSE DEPTH = short (default): Answer in 1–4 short paragraphs, usually under ~150 words. Answer only what was asked. Include important source/evidence when appropriate. Optionally offer ONE useful next step. Do not add lectures, background essays, or unrelated recommendations.`;
    case 2:
      return `RESPONSE DEPTH = 2: Answer the question and add only essential supporting context the user needs to act. Stay brief.`;
    case 3:
      return `RESPONSE DEPTH = explain: Provide a clear, moderate explanation. Separate Guardian facts from general advice when both apply. Not an enormous essay.`;
    case 4:
      return `RESPONSE DEPTH = deep: Thorough analysis using relevant Guardian knowledge is permitted. Still do not invent personal or Space facts.`;
  }
}

/** Max tokens hint from depth. */
export function maxTokensForDepth(depth: ResponseDepth): number {
  switch (depth) {
    case 1:
      return 220;
    case 2:
      return 450;
    case 3:
      return 900;
    case 4:
      return 1400;
  }
}
