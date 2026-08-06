import type { KnowledgeReviewStatus } from "./types";
import {
  knowledgeAutoSaveThreshold,
  knowledgeSuggestThreshold,
} from "@/lib/features/knowledge-engine-v2";

export function reviewStatusForConfidence(
  confidence: number
): KnowledgeReviewStatus | null {
  if (confidence >= knowledgeAutoSaveThreshold()) return "confirmed";
  if (confidence >= knowledgeSuggestThreshold()) return "suggested";
  return null;
}

export function shouldPersistFact(confidence: number): boolean {
  return confidence >= knowledgeSuggestThreshold();
}
