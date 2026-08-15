/**
 * Lightweight insight model helpers for V1.1 (advisory) / V1.2 (proactive).
 */

import type { AdvisoryInsight } from "./types";

export type BusinessInsightRecord = {
  organization_id: string;
  type: string;
  entity_id: string | null;
  title: string;
  summary: string;
  priority: number;
  confidence: number;
  evidence: unknown;
  status: "open" | "dismissed" | "acted";
};

export function advisoryToInsightRecords(
  organizationId: string,
  insights: AdvisoryInsight[]
): BusinessInsightRecord[] {
  return insights.map((insight) => ({
    organization_id: organizationId,
    type: insight.type,
    entity_id: insight.entityId,
    title: insight.title,
    summary: insight.summary,
    priority: insight.priority,
    confidence: insight.confidence,
    evidence: insight.evidence,
    status: "open" as const,
  }));
}
