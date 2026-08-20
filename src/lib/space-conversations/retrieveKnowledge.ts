import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SPACE_KNOWLEDGE_ITEM_SELECT,
  type SpaceKnowledgeItem,
  type SpaceKnowledgeKind,
} from "./types";

function scoreTextMatch(haystack: string, query: string): number {
  const h = haystack.toLowerCase();
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return 0;
  let hits = 0;
  for (const t of tokens) {
    if (h.includes(t)) hits += 1;
  }
  return hits / tokens.length;
}

/**
 * Load durable Space knowledge (decisions / tasks / notes) for Gideon retrieval.
 * Prefer these over casual conversation history.
 */
export async function retrieveSpaceKnowledgeForGideon(
  supabase: SupabaseClient,
  args: {
    profileId: string;
    question: string;
    limit?: number;
  }
): Promise<SpaceKnowledgeItem[]> {
  const limit = args.limit ?? 12;
  const { data, error } = await supabase
    .from("space_knowledge_items")
    .select(SPACE_KNOWLEDGE_ITEM_SELECT)
    .eq("profile_id", args.profileId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error || !data?.length) return [];

  const rows = data as SpaceKnowledgeItem[];
  const scored = rows
    .map((row) => {
      const blob = `${row.kind} ${row.title ?? ""} ${row.content}`;
      const score = scoreTextMatch(blob, args.question);
      // Always keep decisions with a small base boost so "what did we decide" works.
      const kindBoost =
        row.kind === "decision" ? 0.15 : row.kind === "task" ? 0.08 : 0.05;
      return { row, score: score + kindBoost };
    })
    .sort((a, b) => b.score - a.score);

  const relevant = scored.filter((s) => s.score >= 0.12).slice(0, limit);
  if (relevant.length > 0) return relevant.map((s) => s.row);

  // Fallback: most recent decisions first, then others.
  const decisions = rows.filter((r) => r.kind === "decision").slice(0, 6);
  const rest = rows
    .filter((r) => r.kind !== "decision")
    .slice(0, Math.max(0, limit - decisions.length));
  return [...decisions, ...rest].slice(0, limit);
}

export function formatSpaceKnowledgeForGideon(
  items: SpaceKnowledgeItem[]
): string {
  if (!items.length) return "";
  const lines: string[] = [];
  for (const item of items) {
    const kind = item.kind.toUpperCase();
    const title = item.title?.trim();
    const header = title ? `[${kind}] ${title}` : `[${kind}]`;
    const date = item.created_at
      ? new Date(item.created_at).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";
    lines.push(
      `${header}${date ? ` (${date})` : ""}\nid:${item.id}\n${item.content.trim()}`
    );
  }
  return lines.join("\n\n");
}

export function knowledgeCitationsFromItems(
  items: SpaceKnowledgeItem[],
  answer: string
): {
  knowledgeItemId: string;
  fileName: string;
  knowledgeKind: SpaceKnowledgeKind;
  kind: "knowledge";
  documentId: string;
}[] {
  const lower = answer.toLowerCase();
  const out: {
    knowledgeItemId: string;
    fileName: string;
    knowledgeKind: SpaceKnowledgeKind;
    kind: "knowledge";
    documentId: string;
  }[] = [];
  for (const item of items) {
    const title = item.title?.trim() || item.content.slice(0, 48).trim();
    const label = `${item.kind === "decision" ? "Decision" : item.kind === "task" ? "Task" : "Note"}: ${title}`;
    const needles = [
      item.content.slice(0, 80).toLowerCase(),
      ...(item.title ? [item.title.toLowerCase()] : []),
      item.kind,
    ].filter(Boolean);
    const mentioned = needles.some(
      (n) => n.length >= 4 && lower.includes(n.slice(0, Math.min(n.length, 40)))
    );
    // Prefer citing when answer discusses decisions / saved knowledge generally
    const kindMentioned =
      (item.kind === "decision" && /decid|decision|agreed|we will/i.test(answer)) ||
      (item.kind === "task" && /task|todo|action item/i.test(answer)) ||
      (item.kind === "note" && /note|noted|remembered/i.test(answer));
    if (!mentioned && !kindMentioned) continue;
    out.push({
      knowledgeItemId: item.id,
      fileName: label,
      knowledgeKind: item.kind,
      kind: "knowledge",
      // documentId required by some UI helpers; use knowledge id as stable key
      documentId: `knowledge:${item.id}`,
    });
  }
  return out.slice(0, 6);
}
