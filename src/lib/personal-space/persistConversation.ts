import type { SupabaseClient } from "@supabase/supabase-js";
import {
  confirmedExtractions,
  extractPersonalKnowledgeFromText,
} from "./conversationExtract";

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Persist confirmed Personal Space facts extracted from a chat utterance. */
export async function persistConversationKnowledge(
  supabase: SupabaseClient,
  args: {
    userId: string;
    profileId: string;
    text: string;
  }
): Promise<{
  entities: number;
  relationships: number;
  facts: number;
  rememberReply: string | null;
  confirmations: ReturnType<
    typeof extractPersonalKnowledgeFromText
  >["confirmations"];
}> {
  const extraction = extractPersonalKnowledgeFromText(args.text);
  const toPersist = confirmedExtractions(extraction);
  const persisted = { entities: 0, relationships: 0, facts: 0 };
  const sourceId = `chat:${Date.now()}`;

  for (const e of toPersist.entities) {
    const entityType = e.kind === "commitment" ? "task" : e.kind;
    const { error } = await supabase.from("guardian_knowledge_entities").upsert(
      {
        owner_user_id: args.userId,
        profile_id: args.profileId,
        name: e.name,
        normalized_name: normalizeName(e.name),
        entity_type: entityType,
        confidence: e.confidence,
        review_status: "confirmed",
        source_type: "conversation",
        source_id: sourceId,
        metadata: e.attributes ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_user_id,profile_id,entity_type,normalized_name" }
    );
    if (!error) persisted.entities += 1;
  }

  for (const r of toPersist.relationships) {
    const key = `${normalizeName(r.subject)}|${r.predicate}|${normalizeName(r.object)}`;
    const { error } = await supabase
      .from("guardian_knowledge_relationships")
      .upsert(
        {
          owner_user_id: args.userId,
          profile_id: args.profileId,
          subject: r.subject,
          relationship: r.predicate,
          object: r.object,
          normalized_key: key,
          confidence: r.confidence,
          source_type: "conversation",
          source_id: sourceId,
        },
        { onConflict: "owner_user_id,profile_id,normalized_key" }
      );
    if (!error) persisted.relationships += 1;
  }

  for (const f of toPersist.facts) {
    const { error } = await supabase.from("guardian_knowledge_facts").insert({
      owner_user_id: args.userId,
      profile_id: args.profileId,
      subject_name: f.subject,
      predicate: f.predicate,
      object_value: f.value ?? f.object ?? null,
      confidence: f.confidence,
      review_status: "confirmed",
      source_type: "conversation",
      source_id: sourceId,
      source_excerpt: f.sourceExcerpt ?? args.text.slice(0, 300),
      updated_at: new Date().toISOString(),
    });
    if (!error) persisted.facts += 1;
  }

  return {
    ...persisted,
    rememberReply: extraction.rememberReply,
    confirmations: extraction.confirmations,
  };
}
